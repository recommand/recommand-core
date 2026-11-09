import { Server } from "@recommand/lib/api";
import authorize from "./authorize";
import jwtBearer from "./jwt-bearer";

const server = new Server();

server.route("/", authorize);
server.route("/", jwtBearer);

export default server;
