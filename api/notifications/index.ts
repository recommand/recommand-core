import { Server } from "@recommand/lib/api";
import actionLinks, { type NotificationActionLinks } from "./action-links";
import preferences, { type NotificationPreferences } from "./preferences";

export type NotificationsApi = NotificationActionLinks | NotificationPreferences;

const server = new Server();

server.route("/", actionLinks);
server.route("/", preferences);

export default server;
