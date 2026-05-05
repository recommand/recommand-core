import "zod-openapi/extend";
import { Server } from "@recommand/lib/api";
import createRuleServer, { type CreateRule } from "./create-rule";
import deleteRuleServer, { type DeleteRule } from "./delete-rule";
import getEventTypeServer, { type GetEventType } from "./get-event-type";
import getRuleServer, { type GetRule } from "./get-rule";
import listRuleDeliveriesServer, { type ListRuleDeliveries } from "./list-rule-deliveries";
import listEventTypesServer, { type ListEventTypes } from "./list-event-types";
import listRulesServer, { type ListRules } from "./list-rules";
import retryRuleDeliveryServer, { type RetryRuleDelivery } from "./retry-rule-delivery";
import updateRuleServer, { type UpdateRule } from "./update-rule";

export type RulesApi =
  | ListRules
  | CreateRule
  | GetRule
  | UpdateRule
  | DeleteRule
  | ListRuleDeliveries
  | RetryRuleDelivery
  | ListEventTypes
  | GetEventType;

const server = new Server();

server.route("/", listRulesServer);
server.route("/", createRuleServer);
server.route("/", getRuleServer);
server.route("/", updateRuleServer);
server.route("/", deleteRuleServer);
server.route("/", listRuleDeliveriesServer);
server.route("/", retryRuleDeliveryServer);
server.route("/", listEventTypesServer);
server.route("/", getEventTypeServer);

export default server;
