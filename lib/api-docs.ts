import { zodResolver } from "@recommand/lib/zod-validator";
import type { OpenAPIV3, OpenAPIV3_1 } from "openapi-types";
import z from "zod";
import "zod-openapi/extend";

/**
 * A boolean filter in a query string, where every value is a string. Shared so
 * that every such filter is one type in the OpenAPI document.
 */
export const booleanStringSchema = z.enum(["true", "false"]).openapi({
  description: "A boolean, written as `true` or `false`.",
  examples: ["true"],
  ref: "BooleanString",
});

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

export function describeSuccessResponse<T>(
  description: string,
  bodySchema: any = {}
): {
  [key: string]: OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject;
} {
  return {
    [200]: {
      description,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              success: { type: "boolean", examples: [true] },
              ...bodySchema,
            },
          },
        },
      },
    },
  };
}

/**
 * A 200 response whose body is `bodySchema` with `success: true` added. A
 * description given to `bodySchema` with `.openapi()` describes the body.
 */
export function describeSuccessResponseWithZod(
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

export function describeErrorResponse(
  status: number,
  description: string,
  bodySchema: any = {}
): {
  [key: string]: OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject;
} {
  return {
    [status]: {
      description,
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              success: { type: "boolean", const: false },
              errors: {
                type: "object",
                additionalProperties: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              ...bodySchema,
            },
            required: ["success", "errors"],
          },
        },
      },
    },
  };
}

/**
 * The 400 a route answers when the request does not match its schema.
 *
 * On top of the `errors` map every error response carries, the request
 * validator adds `invalidInputDetails`: the same failures as a list, each with
 * the path it applies to. For a union of schemas it also carries the failures
 * of every variant, so a caller can see why the other variants were not a
 * match. The field is optional, because a 400 the route raises itself answers
 * with the plain error body.
 */
export function describeValidationErrorResponse(
  description: string,
  bodySchema: any = {}
): {
  [key: string]: OpenAPIV3.ReferenceObject | OpenAPIV3.ResponseObject;
} {
  const inputDetail = {
    path: {
      type: "string",
      description: "Dotted path of the field the message applies to.",
    },
    message: { type: "string" },
  };

  return describeErrorResponse(400, description, {
    invalidInputDetails: {
      type: "array",
      description:
        "Present when the request body or query did not match the schema.",
      items: {
        type: "object",
        properties: {
          ...inputDetail,
          unionErrors: {
            type: "array",
            description:
              "For a union of schemas, the failures of every variant, in the order the variants are declared.",
            items: {
              type: "array",
              items: { type: "object", properties: inputDetail },
            },
          },
        },
      },
    },
    ...bodySchema,
  });
}
