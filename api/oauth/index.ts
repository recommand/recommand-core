import { Server } from "@recommand/lib/api";
import authorize from "./authorize";
import jwtBearer from "./jwt-bearer";
import register from "./register";

const server = new Server();

server.route("/", authorize);
server.route("/", jwtBearer);
server.route("/", register);

export default server;
