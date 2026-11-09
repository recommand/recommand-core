import { Server } from "@recommand/lib/api";
import authorize from "./authorize";
import jwtBearer from "./jwt-bearer";
import register from "./register";
import token from "./token";

const server = new Server();

server.route("/", authorize);
server.route("/", jwtBearer);
server.route("/", register);
server.route("/", token);

export default server;
