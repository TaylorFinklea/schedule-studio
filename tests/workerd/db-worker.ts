import type {
  D1Database,
  D1PreparedStatement,
} from "@cloudflare/workers-types";
import {
  activeTemplateId,
  activateVersion,
  createVersion,
  createCategory,
  deleteVersion,
  getDb,
  getWeekView,
  reorderCategory,
  setDefaultVersion,
  updateCategory,
  withD1Database,
} from "../../src/lib/server/db";

type Env = { DB: D1Database };

function pauseActiveLookup(
  db: D1Database,
  staleId: string,
  signalPaused: () => void,
  resumePromise: Promise<void>,
) {
  let pauseOnce = true;

  const wrapStatement = (
    statement: D1PreparedStatement,
    sql: string,
    bound: unknown[] = [],
  ): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, property) {
        if (property === "bind") {
          return (...params: unknown[]) =>
            wrapStatement(target.bind(...(params as never[])), sql, params);
        }
        if (property === "first") {
          return async (...params: unknown[]) => {
            if (
              pauseOnce &&
              sql === "SELECT id FROM templates WHERE id = ?" &&
              (params[0] ?? bound[0]) === staleId
            ) {
              pauseOnce = false;
              signalPaused();
              await resumePromise;
            }
            return target.first();
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

  return new Proxy(db, {
    get(target, property) {
      if (property === "prepare") {
        return (sql: string) => wrapStatement(target.prepare(sql), sql);
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname === "/ready")
      return new Response("ready");
    if (new URL(request.url).pathname !== "/run")
      return new Response("Not found", { status: 404 });

    try {
      const evidence = await withD1Database(env.DB, async () => {
        const before = await getWeekView();
        const sourceId = before.defaultTemplateId;
        const baselineItemCount = before.versions.find(
          (version) => version.id === sourceId,
        )?.itemCount;
        assert(
          typeof baselineItemCount === "number",
          "default version missing",
        );

        const [first, second] = await Promise.all([
          createVersion({ name: "Workerd copy A", sourceTemplateId: sourceId }),
          createVersion({ name: "Workerd copy B", sourceTemplateId: sourceId }),
        ]);
        assert(
          first.itemCount === baselineItemCount,
          "first D1 clone lost items",
        );
        assert(
          second.itemCount === baselineItemCount,
          "second D1 clone lost items",
        );

        const sourceItem = (await getDb()
          .prepare(
            "SELECT id, title FROM schedule_items WHERE template_id = ? ORDER BY weekday, start_minute LIMIT 1",
          )
          .get(sourceId)) as { id: string; title: string };
        const sourceBounds = (await getDb()
          .prepare(
            "SELECT wake_minute FROM day_bounds WHERE template_id = ? AND weekday = 1",
          )
          .get(sourceId)) as { wake_minute: number };
        const editedWakeMinute = sourceBounds.wake_minute === 235 ? 230 : 235;
        await env.DB.prepare(
          `
          CREATE TRIGGER edit_source_during_clone
          BEFORE INSERT ON templates
          WHEN NEW.name = 'Snapshot probe'
          BEGIN
            UPDATE day_bounds SET wake_minute = ${editedWakeMinute}
             WHERE template_id = '${sourceId}' AND weekday = 1;
            UPDATE schedule_items SET title = 'Snapshot source edit' WHERE id = '${sourceItem.id}';
          END
        `,
        ).run();
        const snapshotClone = await createVersion({
          name: "Snapshot probe",
          sourceTemplateId: sourceId,
        });
        await env.DB.prepare("DROP TRIGGER edit_source_during_clone").run();
        const snapshotBounds = (await getDb()
          .prepare(
            "SELECT wake_minute FROM day_bounds WHERE template_id = ? AND weekday = 1",
          )
          .get(snapshotClone.id)) as { wake_minute: number };
        const snapshotItem = (await getDb()
          .prepare(
            "SELECT title FROM schedule_items WHERE template_id = ? AND weekday = 1 AND start_minute = (SELECT start_minute FROM schedule_items WHERE id = ?)",
          )
          .get(snapshotClone.id, sourceItem.id)) as { title: string };
        assert(
          snapshotBounds.wake_minute === editedWakeMinute,
          "D1 clone missed concurrent bounds edit",
        );
        assert(
          snapshotItem.title === "Snapshot source edit",
          "D1 clone missed concurrent item edit",
        );
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE day_bounds SET wake_minute = ? WHERE template_id = ? AND weekday = 1",
          ).bind(sourceBounds.wake_minute, sourceId),
          env.DB.prepare(
            "UPDATE schedule_items SET title = ? WHERE id = ?",
          ).bind(sourceItem.title, sourceItem.id),
        ]);

        const topLevel = before.categories.filter(
          (category) => !category.parentId && !category.archived,
        );
        assert(
          topLevel.length > 1,
          "seed needs sibling categories for reorder test",
        );
        const beforeOrder = topLevel.map((category) => category.id);
        await reorderCategory(beforeOrder[0], "down");
        const afterOrder = (await getWeekView()).categories
          .filter((category) => !category.parentId && !category.archived)
          .map((category) => category.id);
        assert(
          afterOrder[0] === beforeOrder[1],
          "D1 reorder did not swap siblings",
        );

        const [left, right] = await Promise.all([
          createCategory({ name: "Concurrent left", color: "#123456" }),
          createCategory({ name: "Concurrent right", color: "#654321" }),
        ]);
        const oppositeMoves = await Promise.allSettled([
          updateCategory({ id: left, parentId: right }),
          updateCategory({ id: right, parentId: left }),
        ]);
        assert(
          oppositeMoves.filter((result) => result.status === "fulfilled")
            .length === 1,
          "D1 allowed an invalid concurrent reparent",
        );
        assert(
          oppositeMoves.filter((result) => result.status === "rejected")
            .length === 1,
          "D1 rejected both concurrent reparents",
        );
        const cycle = await getDb()
          .prepare(
            "SELECT child.id FROM categories AS child JOIN categories AS parent ON parent.id = child.parent_id WHERE parent.parent_id = child.id LIMIT 1",
          )
          .get();
        assert(!cycle, "D1 reparenting created a category cycle");

        const [movingParent, destination] = await Promise.all([
          createCategory({ name: "Concurrent parent", color: "#123456" }),
          createCategory({ name: "Concurrent destination", color: "#654321" }),
        ]);
        const childOrMove = await Promise.allSettled([
          createCategory({
            name: "Concurrent child",
            color: "#abcdef",
            parentId: movingParent,
          }),
          updateCategory({ id: movingParent, parentId: destination }),
        ]);
        assert(
          childOrMove.filter((result) => result.status === "fulfilled")
            .length === 1,
          "D1 child-create/reparent race had no winner",
        );
        assert(
          childOrMove.filter((result) => result.status === "rejected")
            .length === 1,
          "D1 child-create/reparent race allowed both operations",
        );
        const invalidDepth = await getDb()
          .prepare(
            "SELECT child.id FROM categories AS child JOIN categories AS parent ON parent.id = child.parent_id WHERE parent.parent_id IS NOT NULL LIMIT 1",
          )
          .get();
        assert(
          !invalidDepth,
          "D1 child-create/reparent race created a third category level",
        );

        const activeBeforeFailure = (await getWeekView()).templateId;
        const versionCountBeforeFailure = (await getWeekView()).versions.length;
        await env.DB.prepare(
          `
          CREATE TRIGGER fail_version_clone_item
          BEFORE INSERT ON schedule_items
          WHEN NEW.template_id <> '${sourceId}'
          BEGIN SELECT RAISE(ABORT, 'forced version clone failure'); END
        `,
        ).run();
        let cloneFailed = false;
        try {
          await createVersion({
            name: "Workerd rollback copy",
            sourceTemplateId: sourceId,
          });
        } catch (error) {
          cloneFailed = String(error).includes("forced version clone failure");
        } finally {
          await env.DB.prepare("DROP TRIGGER fail_version_clone_item").run();
        }
        assert(cloneFailed, "forced D1 clone failure did not reach the caller");
        const afterFailure = await getWeekView();
        assert(
          afterFailure.versions.length === versionCountBeforeFailure,
          "failed D1 clone left a partial version",
        );
        assert(
          afterFailure.templateId === activeBeforeFailure,
          "failed D1 clone changed the active version",
        );

        let defaultDeleteRejected = false;
        try {
          await deleteVersion(sourceId);
        } catch (error) {
          defaultDeleteRejected = String(error).includes(
            "default schedule version cannot be deleted",
          );
        }
        assert(defaultDeleteRejected, "D1 deleted the default version");

        const defaultRaceTarget = await createVersion({
          name: "Default race target",
          sourceTemplateId: sourceId,
        });
        const defaultRace = await Promise.allSettled([
          setDefaultVersion(defaultRaceTarget.id),
          deleteVersion(defaultRaceTarget.id),
        ]);
        assert(
          defaultRace.filter((result) => result.status === "fulfilled")
            .length === 1,
          "D1 default race did not have one successful mutation",
        );
        assert(
          defaultRace.filter((result) => result.status === "rejected")
            .length === 1,
          "D1 default race allowed setter and deleter to both succeed",
        );
        const activePointerAfterRace = (await getDb()
          .prepare(
            "SELECT value FROM app_settings WHERE key = 'active_template_id'",
          )
          .get()) as { value: string };
        const afterDefaultRace = await getWeekView();
        assert(
          activePointerAfterRace.value === afterDefaultRace.templateId,
          "D1 delete left a dangling active pointer",
        );
        assert(
          afterDefaultRace.versions.some(
            (version) => version.id === afterDefaultRace.defaultTemplateId,
          ),
          "D1 default pointer references a missing version",
        );
        if (afterDefaultRace.defaultTemplateId === defaultRaceTarget.id) {
          assert(
            afterDefaultRace.versions.some(
              (version) => version.id === defaultRaceTarget.id,
            ),
            "D1 deleted the concurrent default",
          );
        } else {
          assert(
            !afterDefaultRace.versions.some(
              (version) => version.id === defaultRaceTarget.id,
            ),
            "D1 retained the deleted race target",
          );
        }

        const staleActive = await createVersion({
          name: "Stale active race target",
          sourceTemplateId: sourceId,
        });
        const newerActive = await createVersion({
          name: "New active race target",
          sourceTemplateId: sourceId,
        });
        await activateVersion(staleActive.id);
        let resumeLookup!: () => void;
        let signalPausedLookup!: () => void;
        const resumeLookupPromise = new Promise<void>((resolve) => {
          resumeLookup = resolve;
        });
        const pausedLookupPromise = new Promise<void>((resolve) => {
          signalPausedLookup = resolve;
        });
        const readStaleActive = withD1Database(
          pauseActiveLookup(
            env.DB,
            staleActive.id,
            signalPausedLookup,
            resumeLookupPromise,
          ),
          () => activeTemplateId(),
        );
        await pausedLookupPromise;
        try {
          await deleteVersion(staleActive.id);
          await activateVersion(newerActive.id);
        } finally {
          resumeLookup();
        }
        assert(
          (await readStaleActive) === newerActive.id,
          "D1 stale active repair overwrote a newer selection",
        );
        const activeAfterRepair = (await getDb()
          .prepare(
            "SELECT value FROM app_settings WHERE key = 'active_template_id'",
          )
          .get()) as { value: string };
        assert(
          activeAfterRepair.value === newerActive.id,
          "D1 stale active repair changed the persisted newer selection",
        );

        const remaining = (await getDb()
          .prepare(
            "SELECT COUNT(*) AS count FROM schedule_items WHERE template_id = ?",
          )
          .get(sourceId)) as { count: number };
        return {
          clonedItems: [first.itemCount, second.itemCount],
          sourceSnapshotConsistent: true,
          reordered: true,
          concurrentHierarchyProtected: true,
          rollbackPreservedVersionCount: true,
          defaultDeleteProtected: true,
          defaultSetterDeleteRaceProtected: true,
          staleActiveRepairPreservedNewSelection: true,
          sourceItemCount: remaining.count,
        };
      });

      return Response.json(evidence);
    } catch (error) {
      return Response.json({ error: String(error) }, { status: 500 });
    }
  },
};
