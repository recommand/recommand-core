import { Server } from "@recommand/lib/api";
import getCursorServer, { type GetCursor } from "./get-cursor";
import getEventDataServer, { type GetEventData } from "./get-event-data";
import listEventsServer, { type ListEvents } from "./list-events";
import setCursorServer, { type SetCursor } from "./set-cursor";

export type EventsApi = ListEvents | GetEventData | GetCursor | SetCursor;

const server = new Server();

server.route("/", listEventsServer);
server.route("/", getEventDataServer);
server.route("/", getCursorServer);
server.route("/", setCursorServer);

export default server;
