import { zodResolver } from "@recommand/lib/zod-validator";
import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import z from "zod";
import "zod-openapi/extend";

/**
 * A boolean query parameter. A query string carries it as the text `true` or
 * `false`, which is how OpenAPI writes a boolean parameter, so the document
 * declares it a boolean and a generated client takes one. Any other text,
 * an empty value included, is rejected.
 */
export const booleanQuerySchema = z.preprocess(
  (value) => (value === "true" ? true : value === "false" ? false : value),
  z.boolean()
);

/** The page a list endpoint returns alongside its items. */
export const paginationResponse = z
  .object({
    limit: z.number().int().min(1).openapi({ description: "Maximum number of items on a page." }),
    page: z.number().int().min(1).openapi({ description: "The page returned, counting from 1." }),
    total: z.number().int().min(0).openapi({ description: "Total number of items across all pages." }),
    totalPages: z.number().int().min(0).openapi({ description: "Number of pages at this page size." }),
  })
  .openapi({ ref: "Pagination" });

/**
 * A parameter's or header's schema, written as the OpenAPI 3.1 Schema Object it
 * is. `openapi-types` types it as an OpenAPI 3.0 one, without `examples`
 * (https://github.com/kogosoftwarellc/open-api/issues/923), so it's cast to that.
 */
export const parameterSchema = (schema: OpenAPIV3_1.SchemaObject) =>
  schema as OpenAPIV3.SchemaObject;

/**
 * The query schema of a list endpoint: its `limit` and `page`, to extend with
 * any other parameters the list takes. Every list counts pages from 1; how
 * many items a page holds by default, and at most, is the list's own choice.
 */
export const paginationQuery = ({
  defaultLimit,
  maxLimit,
  maxPage,
}: {
  defaultLimit: number;
  maxLimit: number;
  maxPage?: number;
}) =>
  z.object({
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit).openapi({
      description: "The number of items per page",
      examples: [defaultLimit],
    }),
    page: (maxPage === undefined
      ? z.coerce.number().int().min(1)
      : z.coerce.number().int().min(1).max(maxPage)
    )
      .default(1)
      .openapi({
        description: "The page number to retrieve",
        examples: [1],
      }),
  });

/**
 * A 200 response whose body is `bodySchema` with `success: true` added. A
 * description given to `bodySchema` with `.openapi()` describes the body.
 */
export function describeSuccessResponse(
  description: string,
  bodySchema: z.ZodObject<any> = z.object({})
) {
  return {
    200: {
      description,
      content: {
        "application/json": {
          schema: zodResolver(
            z
              .object({
                success: z.literal(true),
              })
              .extend(bodySchema.shape)
              .openapi({ description: bodySchema._def.zodOpenApi?.openapi?.description })
          ),
        },
      },
    },
  };
}

/**
 * The body of every error response: `success: false`, and the messages that say
 * what went wrong. `actionFailure` and the request validator both answer with it.
 */
const errorResponse = z
  .object({
    success: z.literal(false),
    errors: z.record(z.string(), z.array(z.string())).openapi({
      description:
        "What went wrong, per field of the request. Messages about the request as a whole are under `root`.",
    }),
  })
  .openapi({ ref: "ErrorResponse" });

/**
 * A response with an error status, whose body is the error body with the
 * fields of `bodySchema` added, for a route that says more than the messages.
 * A description given to `bodySchema` with `.openapi()` describes the body.
 */
export function describeErrorResponse(
  status: number,
  description: string,
  bodySchema: z.ZodObject<any> = z.object({})
) {
  return {
    [status]: {
      description,
      content: {
        "application/json": {
          schema: zodResolver(
            errorResponse
              .extend(bodySchema.shape)
              .openapi({ description: bodySchema._def.zodOpenApi?.openapi?.description })
          ),
        },
      },
    },
  };
}

const inputDetail = z
  .object({
    path: z.string().openapi({
      description: "Dotted path of the field the message applies to.",
    }),
    message: z.string(),
  })
  .openapi({ ref: "InputDetail" });

const invalidInputDetail = inputDetail
  .extend({
    unionErrors: z
      .array(z.array(inputDetail))
      .optional()
      .openapi({
        description:
          "For a union of schemas, the failures of every variant, in the order the variants are declared.",
      }),
  })
  .openapi({ ref: "InvalidInputDetail" });

/**
 * The body of a 400 the request validator answers when the request does not
 * match its schema.
 *
 * On top of the `errors` map every error response carries, it adds
 * `invalidInputDetails`: the same failures as a list, each with the path it
 * applies to. For a union of schemas it also carries the failures of every
 * variant, so a caller can see why the other variants were not a match. The
 * field is optional, because a 400 the route raises itself answers with the
 * plain error body.
 */
const validationErrorResponse = errorResponse
  .extend({
    invalidInputDetails: z
      .array(invalidInputDetail)
      .optional()
      .openapi({
        description:
          "Present when the request body or query did not match the schema.",
      }),
  })
  .openapi({ ref: "ValidationErrorResponse" });

/** The 400 a route answers when the request does not match its schema. */
export function describeValidationErrorResponse(description: string) {
  return {
    400: {
      description,
      content: {
        "application/json": { schema: zodResolver(validationErrorResponse) },
      },
    },
  };
}
