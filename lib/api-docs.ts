import { zodResolver } from "@recommand/lib/zod-validator";
import type { OpenAPIV3 } from "openapi-types";
import z from "zod";

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
              success: { type: "boolean", example: true },
              ...bodySchema,
            },
          },
        },
      },
    },
  };
}

export function describeSuccessResponseWithZod(
  description: string,
  bodySchema: z.ZodObject<any>
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
              success: { type: "boolean", example: false },
              errors: {
                type: "object",
                additionalProperties: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              ...bodySchema,
            },
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
