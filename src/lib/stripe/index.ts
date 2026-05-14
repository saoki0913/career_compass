import Stripe from "stripe";
import { serverEnv } from "@/env/server";

export const stripe = new Stripe(serverEnv.STRIPE_SECRET_KEY, {
  apiVersion: "2025-12-15.clover",
  typescript: true,
});
