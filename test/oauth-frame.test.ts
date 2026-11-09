import { expect, test } from "bun:test";
import { Hono } from "hono";
import { forbidFraming } from "../lib/oauth/frame";

test("the consent screen can't be framed by another site", async () => {
  const app = new Hono().use("/oauth/authorize", forbidFraming).get("*", (c) => c.html("<html></html>"));
  const consent = await app.request("/oauth/authorize?client_id=app");
  expect([consent.headers.get("Content-Security-Policy"), consent.headers.get("X-Frame-Options")]).toEqual(["frame-ancestors 'none'", "DENY"]);
  expect((await app.request("/account")).headers.get("Content-Security-Policy")).toBeNull();
});
