import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      // カレンダー連携用スコープは後で追加
      // カレンダー機能実装時にGoogle Cloud Consoleでスコープ検証後に有効化
      // scope: [
      //   "openid",
      //   "email",
      //   "profile",
      //   "https://www.googleapis.com/auth/calendar.readonly",
      //   "https://www.googleapis.com/auth/calendar.events",
      //   "https://www.googleapis.com/auth/calendar.freebusy",
      // ],
    },
  },
});

export type Session = typeof auth.$Infer.Session;
