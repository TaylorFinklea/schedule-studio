declare global {
  namespace App {
    interface Platform {
      env: {
        DB: import("@cloudflare/workers-types").D1Database;
        CLOUDFLARE_ACCESS_ISSUER: string;
        CLOUDFLARE_ACCESS_AUD: string;
        SCHEDULE_STUDIO_ACCESS_OWNER_EMAIL: string;
        SCHEDULE_STUDIO_HOSTNAME: string;
      };
    }
  }
}

export {};
