import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const testDirectory = mkdtempSync(join(tmpdir(), "schedule-studio-db-test-"));
process.env.SCHEDULE_STUDIO_DB = join(testDirectory, "schedule.sqlite");

const dbModule = await import("./db");

afterAll(() => rmSync(testDirectory, { recursive: true, force: true }));

describe("schedule database transactions", () => {
  it("validates category hierarchy and clones versions atomically under concurrent requests", async () => {
    const {
      activateVersion,
      createCategory,
      createVersion,
      deleteVersion,
      getDb,
      getWeekView,
      setDefaultVersion,
      updateCategory,
    } = dbModule;
    const initial = await getWeekView();
    const source = initial.defaultTemplateId;
    const root = await createCategory({
      name: "Test parent",
      color: "#123456",
    });
    const child = await createCategory({
      name: "Test child",
      color: "#654321",
      parentId: root,
    });

    await expect(
      createCategory({
        name: "Missing parent",
        color: "#000000",
        parentId: "missing",
      }),
    ).rejects.toBeInstanceOf(dbModule.CategoryHierarchyError);
    await expect(
      updateCategory({ id: child, parentId: child }),
    ).rejects.toBeInstanceOf(dbModule.CategoryHierarchyError);
    await expect(
      updateCategory({ id: root, parentId: child }),
    ).rejects.toBeInstanceOf(dbModule.CategoryHierarchyError);

    const [left, right] = await Promise.all([
      createCategory({ name: "Concurrent left", color: "#123456" }),
      createCategory({ name: "Concurrent right", color: "#654321" }),
    ]);
    const oppositeMoves = await Promise.allSettled([
      updateCategory({ id: left, parentId: right }),
      updateCategory({ id: right, parentId: left }),
    ]);
    expect(
      oppositeMoves.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      oppositeMoves.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const cycle = await getDb()
      .prepare(
        "SELECT child.id FROM categories AS child JOIN categories AS parent ON parent.id = child.parent_id WHERE parent.parent_id = child.id LIMIT 1",
      )
      .get();
    expect(cycle).toBeUndefined();

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
    expect(
      childOrMove.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      childOrMove.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const invalidDepth = await getDb()
      .prepare(
        "SELECT child.id FROM categories AS child JOIN categories AS parent ON parent.id = child.parent_id WHERE parent.parent_id IS NOT NULL LIMIT 1",
      )
      .get();
    expect(invalidDepth).toBeUndefined();

    const sourceItem = (await getDb()
      .prepare(
        "SELECT id, title FROM schedule_items WHERE template_id = ? ORDER BY weekday, start_minute LIMIT 1",
      )
      .get(source)) as { id: string; title: string };
    const sourceBounds = (await getDb()
      .prepare(
        "SELECT wake_minute FROM day_bounds WHERE template_id = ? AND weekday = 1",
      )
      .get(source)) as { wake_minute: number };
    const editedWakeMinute = sourceBounds.wake_minute === 235 ? 230 : 235;
    await getDb().exec(`
      CREATE TRIGGER edit_source_during_clone
      BEFORE INSERT ON templates
      WHEN NEW.name = 'Snapshot probe'
      BEGIN
        UPDATE day_bounds SET wake_minute = ${editedWakeMinute}
         WHERE template_id = '${source}' AND weekday = 1;
        UPDATE schedule_items SET title = 'Snapshot source edit' WHERE id = '${sourceItem.id}';
      END;
    `);
    const snapshotClone = await createVersion({
      name: "Snapshot probe",
      sourceTemplateId: source,
    });
    await getDb().exec("DROP TRIGGER edit_source_during_clone");
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
    expect(snapshotBounds.wake_minute).toBe(editedWakeMinute);
    expect(snapshotItem.title).toBe("Snapshot source edit");
    await getDb()
      .prepare(
        "UPDATE day_bounds SET wake_minute = ? WHERE template_id = ? AND weekday = 1",
      )
      .run(sourceBounds.wake_minute, source);
    await getDb()
      .prepare("UPDATE schedule_items SET title = ? WHERE id = ?")
      .run(sourceItem.title, sourceItem.id);

    const [first, second] = await Promise.all([
      createVersion({ name: "Concurrent copy A", sourceTemplateId: source }),
      createVersion({ name: "Concurrent copy B", sourceTemplateId: source }),
    ]);
    expect(first.id).not.toBe(second.id);
    expect(first.itemCount).toBe(initial.versions[0].itemCount);
    expect(second.itemCount).toBe(initial.versions[0].itemCount);

    const series = (await getDb()
      .prepare(
        "SELECT template_id, series_id, COUNT(*) AS count FROM schedule_items WHERE template_id IN (?, ?, ?) AND series_id IS NOT NULL GROUP BY template_id, series_id",
      )
      .all(source, first.id, second.id)) as {
      template_id: string;
      series_id: string;
      count: number;
    }[];
    const sourceSeries = series.filter((row) => row.template_id === source);
    const firstSeries = series.filter((row) => row.template_id === first.id);
    const secondSeries = series.filter((row) => row.template_id === second.id);
    expect(sourceSeries.length).toBeGreaterThan(0);
    expect(firstSeries.map((row) => row.count).sort()).toEqual(
      sourceSeries.map((row) => row.count).sort(),
    );
    expect(secondSeries.map((row) => row.count).sort()).toEqual(
      sourceSeries.map((row) => row.count).sort(),
    );
    expect(
      new Set(
        [...sourceSeries, ...firstSeries, ...secondSeries].map(
          (row) => row.series_id,
        ),
      ).size,
    ).toBe(sourceSeries.length + firstSeries.length + secondSeries.length);

    const activeBeforeFailure = (await getWeekView()).templateId;
    await getDb().exec(`
      CREATE TRIGGER fail_version_clone_item
      BEFORE INSERT ON schedule_items
      WHEN NEW.template_id <> '${source}'
      BEGIN SELECT RAISE(ABORT, 'forced version clone failure'); END;
    `);
    await expect(
      createVersion({ name: "Rollback copy", sourceTemplateId: source }),
    ).rejects.toThrow("forced version clone failure");
    await getDb().exec("DROP TRIGGER fail_version_clone_item");

    const afterFailure = await getWeekView();
    expect(afterFailure.versions).toHaveLength(initial.versions.length + 3);
    expect(afterFailure.templateId).toBe(activeBeforeFailure);
    expect(
      afterFailure.versions.some((version) => version.name === "Rollback copy"),
    ).toBe(false);

    const defaultRaceTarget = await createVersion({
      name: "Default race target",
      sourceTemplateId: source,
    });
    const defaultRace = await Promise.allSettled([
      setDefaultVersion(defaultRaceTarget.id),
      deleteVersion(defaultRaceTarget.id),
    ]);
    expect(
      defaultRace.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      defaultRace.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const activePointerAfterRace = (await getDb()
      .prepare(
        "SELECT value FROM app_settings WHERE key = 'active_template_id'",
      )
      .get()) as { value: string };
    const afterDefaultRace = await getWeekView();
    expect(activePointerAfterRace.value).toBe(afterDefaultRace.templateId);
    const defaultStillExists = afterDefaultRace.versions.some(
      (version) => version.id === afterDefaultRace.defaultTemplateId,
    );
    expect(defaultStillExists).toBe(true);
    if (afterDefaultRace.defaultTemplateId === defaultRaceTarget.id) {
      expect(
        afterDefaultRace.versions.some(
          (version) => version.id === defaultRaceTarget.id,
        ),
      ).toBe(true);
    } else {
      expect(
        afterDefaultRace.versions.some(
          (version) => version.id === defaultRaceTarget.id,
        ),
      ).toBe(false);
    }
    await setDefaultVersion(source);
    await activateVersion(source);
  });

  it("does not let stale active-version repair overwrite a newer selection", async () => {
    const {
      activateVersion,
      activeTemplateId,
      createVersion,
      deleteVersion,
      getDb,
      getWeekView,
    } = dbModule;
    const source = (await getWeekView()).defaultTemplateId;
    const stale = await createVersion({
      name: "Stale active",
      sourceTemplateId: source,
    });
    const newer = await createVersion({
      name: "New active",
      sourceTemplateId: source,
    });
    await activateVersion(stale.id);

    const db = getDb();
    let resumeLookup!: () => void;
    let signalPausedLookup!: () => void;
    const resumeLookupPromise = new Promise<void>((resolve) => {
      resumeLookup = resolve;
    });
    const pausedLookupPromise = new Promise<void>((resolve) => {
      signalPausedLookup = resolve;
    });
    let pauseOnce = true;
    const pausedDb = new Proxy(db, {
      get(target, property) {
        if (property === "prepare") {
          return (sql: string) => {
            const statement = target.prepare(sql);
            if (sql !== "SELECT id FROM templates WHERE id = ?")
              return statement;
            return new Proxy(statement, {
              get(statementTarget, statementProperty) {
                if (statementProperty === "get") {
                  return async (...params: unknown[]) => {
                    if (pauseOnce && params[0] === stale.id) {
                      pauseOnce = false;
                      signalPausedLookup();
                      await resumeLookupPromise;
                    }
                    return statementTarget.get(...params);
                  };
                }
                const value = Reflect.get(
                  statementTarget,
                  statementProperty,
                  statementTarget,
                );
                return typeof value === "function"
                  ? value.bind(statementTarget)
                  : value;
              },
            });
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as NonNullable<Parameters<typeof activeTemplateId>[0]>;

    const readActive = activeTemplateId(pausedDb);
    await pausedLookupPromise;
    try {
      await deleteVersion(stale.id);
      await activateVersion(newer.id);
    } finally {
      resumeLookup();
    }

    await expect(readActive).resolves.toBe(newer.id);
    const persisted = (await db
      .prepare(
        "SELECT value FROM app_settings WHERE key = 'active_template_id'",
      )
      .get()) as { value: string };
    expect(persisted.value).toBe(newer.id);
  });
});
