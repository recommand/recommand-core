import { Server } from "@recommand/lib/api";
import jwtBearer from "./jwt-bearer";
import register from "./register";

const server = new Server();

server.route("/", jwtBearer);
server.route("/", register);

export default server;
