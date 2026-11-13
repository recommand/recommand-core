import { Server } from "@recommand/lib/api";
import authorize from "./authorize";
import connectedApps from "./connected-apps";
import jwtBearer from "./jwt-bearer";
import register from "./register";
import revoke from "./revoke";
import token from "./token";

const server = new Server();

server.route("/", authorize);
server.route("/", connectedApps);
server.route("/", jwtBearer);
server.route("/", register);
server.route("/", revoke);
server.route("/", token);

export default server;
