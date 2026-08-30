import { Server } from "@recommand/lib/api";
import createInstallationServer, { type CreateInstallation } from "./create-installation";
import createInstallationTokenServer, {
  type CreateInstallationToken,
} from "./create-installation-token";
import deleteInstallationServer, { type DeleteInstallation } from "./delete-installation";
import deleteInstallationTokenServer, {
  type DeleteInstallationToken,
} from "./delete-installation-token";
import listInstallationsServer, { type ListInstallations } from "./list-installations";
import setInstallationPermissionsServer, {
  type SetInstallationPermissions,
} from "./set-installation-permissions";

export type InstallationsApi =
  | ListInstallations
  | CreateInstallation
  | CreateInstallationToken
  | SetInstallationPermissions
  | DeleteInstallationToken
  | DeleteInstallation;

const server = new Server();

server.route("/", listInstallationsServer);
server.route("/", createInstallationServer);
server.route("/", createInstallationTokenServer);
server.route("/", setInstallationPermissionsServer);
server.route("/", deleteInstallationTokenServer);
server.route("/", deleteInstallationServer);

export default server;
