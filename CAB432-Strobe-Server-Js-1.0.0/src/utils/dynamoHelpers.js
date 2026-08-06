import {
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { ddbDocClient } from "../config/dynamoClient.js";

export async function getById(tableName, id) {
  const { Item } = await ddbDocClient.send(
    new GetCommand({ TableName: tableName, Key: { id } }),
  );
  return Item || null;
}

export async function putItem(tableName, item) {
  await ddbDocClient.send(new PutCommand({ TableName: tableName, Item: item }));
  return item;
}

export async function updateById(tableName, id, updates) {
  const entries = Object.entries(updates);
  const names = {};
  const values = {};
  const setClauses = entries.map(([key, value], i) => {
    names[`#k${i}`] = key;
    values[`:v${i}`] = value;
    return `#k${i} = :v${i}`;
  });

  try {
    const { Attributes } = await ddbDocClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: { id },
        UpdateExpression: `SET ${setClauses.join(", ")}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ConditionExpression: "attribute_exists(id)",
        ReturnValues: "ALL_NEW",
      }),
    );
    return Attributes;
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") return null;
    throw err;
  }
}

export async function deleteById(tableName, id) {
  try {
    await ddbDocClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { id },
        ConditionExpression: "attribute_exists(id)",
      }),
    );
    return true;
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") return false;
    throw err;
  }
}

/**
 * Scans the whole table, paging past DynamoDB's 1MB-per-response cap so
 * callers see every matching row (matching the old in-memory array's
 * always-exhaustive behaviour). Bounded to this table's item count, not
 * a fixed page size, so it's only appropriate at course-assignment scale
 * pending the GSI pass that replaces these with targeted Query calls.
 */
export async function scanAll(tableName, options = {}) {
  const items = [];
  let ExclusiveStartKey;

  do {
    const { Items, LastEvaluatedKey } = await ddbDocClient.send(
      new ScanCommand({
        TableName: tableName,
        ExclusiveStartKey,
        ...options,
      }),
    );
    items.push(...(Items || []));
    ExclusiveStartKey = LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items;
}

/**
 * Queries a GSI (or the base table), paging past the 1MB-per-response cap.
 * Use for equality lookups on an indexed attribute instead of scanAll.
 */
export async function queryAll(tableName, options) {
  const items = [];
  let ExclusiveStartKey;

  do {
    const { Items, LastEvaluatedKey } = await ddbDocClient.send(
      new QueryCommand({
        TableName: tableName,
        ExclusiveStartKey,
        ...options,
      }),
    );
    items.push(...(Items || []));
    ExclusiveStartKey = LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return items;
}

/**
 * Counts matching rows via Query's Select: COUNT, without pulling full
 * items over the wire.
 */
export async function queryCount(tableName, options) {
  let count = 0;
  let ExclusiveStartKey;

  do {
    const { Count, LastEvaluatedKey } = await ddbDocClient.send(
      new QueryCommand({
        TableName: tableName,
        Select: "COUNT",
        ExclusiveStartKey,
        ...options,
      }),
    );
    count += Count || 0;
    ExclusiveStartKey = LastEvaluatedKey;
  } while (ExclusiveStartKey);

  return count;
}
