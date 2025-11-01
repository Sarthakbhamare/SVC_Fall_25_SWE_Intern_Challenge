import { RequestHandler } from "express";
import { Pool } from "pg";
import {
  ContractorRequestSchema,
  ContractorSchema,
  type ContractorRequestResponse,
} from "../../shared/schemas";
import { parseRequestBody } from "./_helpers";

let pool: Pool | null = null;

// Exported for testing - determines which database URL to use based on environment
export function getDatabaseUrl(): string {
  const databaseUrl = process.env.NODE_ENV === 'test' 
    ? process.env.TEST_DATABASE_URL 
    : process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    const envVar = process.env.NODE_ENV === 'test' ? 'TEST_DATABASE_URL' : 'DATABASE_URL';
    throw new Error(`${envVar} environment variable is not set`);
  }
  
  return databaseUrl;
}

// PostgreSQL connection
function getDatabase(): Pool {
  console.log("[DB] Getting database connection...");

  if (pool) {
    console.log("[DB] Using existing connection pool");
    return pool;
  }

  const logDatabaseConfigured = (value?: string) => {
    console.log("[DB] Database URL configured:", value ? "YES" : "NO");
  };

  let databaseUrl: string | undefined;
  try {
    databaseUrl = getDatabaseUrl();
  } catch (error) {
    logDatabaseConfigured(undefined);
    throw error;
  }
  logDatabaseConfigured(databaseUrl);

  try {
    console.log("[DB] Creating PostgreSQL connection pool...");
    pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes('neon.tech') ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    console.log("[DB] PostgreSQL connection pool created successfully");
    return pool;
  } catch (error) {
    console.error("[DB] Failed to create PostgreSQL connection pool:", error);
    throw error;
  }
}

export const handleContractorRequest: RequestHandler = async (req, res) => {
  console.log("[API] ==================== CONTRACTOR REQUEST ====================");
  console.log("[API] Request method:", req.method);
  console.log("[API] Request headers:", JSON.stringify(req.headers, null, 2));
  console.log("[API] Request body:", JSON.stringify(req.body, null, 2));

  const client = getDatabase();

  try {
    console.log("[API] Parsing request body...");
    const parsed = parseRequestBody(req.body);
    
    if (!parsed) {
      console.log("[API] Request body is missing or empty");
      return res.status(400).json({
        success: false,
        message: "Request body is required",
      } as ContractorRequestResponse);
    }
    
    console.log("[API] Validating request body with schema...");
    // Validate request body
    const validatedData = ContractorRequestSchema.parse(parsed);
    console.log("[API] Request body validation successful:", JSON.stringify(validatedData, null, 2));

    // Find the user by email
    console.log(`[API] Looking for user with email: ${validatedData.email}`);
    const userQuery = `SELECT id, email FROM users WHERE email = $1`;
    const userResult = await client.query(userQuery, [validatedData.email]);
    console.log("[API] User found:", userResult.rows.length > 0 ? "YES" : "NO");

    if (userResult.rows.length === 0) {
      console.log("[API] User not found, returning 404 error");
      return res.status(404).json({
        success: false,
        message:
          "User not found. Please complete the qualification form first.",
      } as ContractorRequestResponse);
    }

    const user = userResult.rows[0];
    console.log("[API] User details:", JSON.stringify({ id: user.id, email: user.email }, null, 2));

    // Check if contractor request already exists for this user and company
    console.log(`[API] Checking for existing contractor request for user ${user.id} and company ${validatedData.companySlug}`);
    const existingContractorQuery = `
      SELECT id FROM contractors
      WHERE user_id = $1 AND company_slug = $2
    `;
    const existingContractorResult = await client.query(existingContractorQuery, [user.id, validatedData.companySlug]);
    console.log("[API] Existing contractor request found:", existingContractorResult.rows.length > 0 ? "YES" : "NO");

    if (existingContractorResult.rows.length > 0) {
      console.log("[API] Contractor request already exists, returning 400 error");
      return res.status(400).json({
        success: false,
        message:
          "You have already requested to join this company. Please check your email for updates.",
      } as ContractorRequestResponse);
    }

    // Save contractor request to database using SQL INSERT
    console.log("[API] Saving contractor request to database...");
    const insertContractorQuery = `
      INSERT INTO contractors (user_id, email, company_slug, company_name, status, joined_slack, can_start_job)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at, updated_at
    `;
    const insertValues = [
      user.id,
      validatedData.email,
      validatedData.companySlug,
      validatedData.companyName,
      "pending",
      true, // Set to true since they clicked join
      false  // Will be set to true when company approves
    ];

    const result = await client.query(insertContractorQuery, insertValues);
    console.log("[API] Database insert result:", JSON.stringify(result.rows[0], null, 2));

    if (result.rows.length === 0) {
      console.error("[API] Database insert failed - no rows returned");
      throw new Error("Failed to save contractor request to database");
    }
    console.log("[API] Contractor request saved successfully with ID:", result.rows[0].id);

    // TODO: In a real app, you would also:
    // 1. Send an email to the company notifying them of the new contractor request
    // 2. Send a confirmation email to the user
    // 3. Add the request to a queue for processing
    console.log("[API] TODO: Email notifications would be sent here");

    console.log("[API] Preparing success response...");
    const response: ContractorRequestResponse = {
      success: true,
      message:
        "We've just pinged them. You'll be sent an email and text invite within 72 hours.",
    };
    console.log("[API] Sending response:", JSON.stringify(response, null, 2));

    res.json(response);
    console.log("[API] ==================== REQUEST COMPLETED SUCCESSFULLY ====================");
  } catch (error: any) {
    console.error("[API] ==================== ERROR OCCURRED ====================");
    console.error("[API] Error type:", error.constructor.name);
    console.error("[API] Error message:", error.message);
    console.error("[API] Error stack:", error.stack);
    console.error("[API] Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

    // Handle JSON parse errors
    if (error.message?.includes('Invalid JSON')) {
      console.log("[API] Sending 400 response for JSON parse error");
      return res.status(400).json({
        success: false,
        message: error.message,
      } as ContractorRequestResponse);
    }

    if (error.issues) {
      // Zod validation errors
      console.error("[API] Zod validation errors:", JSON.stringify(error.issues, null, 2));
      const errorMessage = error.issues.map((issue: any) => issue.message).join(", ");
      console.log("[API] Sending 400 response for validation errors:", errorMessage);
      return res.status(400).json({
        success: false,
        message: errorMessage,
      } as ContractorRequestResponse);
    }

    console.log("[API] Sending 500 response for internal server error");
    res.status(500).json({
      success: false,
      message: `Internal server error: ${error.message}`,
    } as ContractorRequestResponse);
    console.error("[API] ==================== REQUEST FAILED ====================");
  }
};
