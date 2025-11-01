import { RequestHandler } from "express";
import { Pool } from "pg";
import {
  SocialQualifyFormSchema,
  UserSchema,
  type SocialQualifyResponse,
} from "../../shared/schemas";

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

// Reddit API integration
async function verifyRedditAccount(username: string): Promise<boolean> {
  console.log(`[REDDIT] Verifying Reddit account: ${username}`);

  try {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;

    console.log("[REDDIT] Client ID configured:", clientId ? "YES" : "NO");
    console.log(
      "[REDDIT] Client Secret configured:",
      clientSecret ? "YES" : "NO",
    );

    if (!clientId || !clientSecret) {
      console.error("[REDDIT] ❌ REDDIT API CREDENTIALS NOT CONFIGURED ❌");
      const missingParts: string[] = [];
      if (!clientId) {
        missingParts.push("REDDIT_CLIENT_ID");
      }
      if (!clientSecret) {
        missingParts.push("REDDIT_CLIENT_SECRET");
      }
      console.error("[REDDIT] Missing:", missingParts.join(" "));
      console.error(
        "[REDDIT] Reddit verification will fail for all users until credentials are set",
      );
      console.error("[REDDIT] See REDDIT_API_SETUP.md for instructions");
      return false;
    }

    // Get Reddit OAuth token
    console.log("[REDDIT] Requesting OAuth token from Reddit...");
    const authResponse = await fetch(
      "https://www.reddit.com/api/v1/access_token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "FairDataUse/1.0.0",
        },
        body: "grant_type=client_credentials",
      },
    );

    console.log("[REDDIT] OAuth response status:", authResponse.status);
    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      console.error("[REDDIT] Failed to get Reddit OAuth token:", errorText);
      return false;
    }

    const authData = await authResponse.json();
    const accessToken = authData.access_token;
    console.log("[REDDIT] OAuth token received:", accessToken ? "YES" : "NO");

    // Check if user exists
    console.log(`[REDDIT] Checking if user '${username}' exists...`);
    const userResponse = await fetch(
      `https://oauth.reddit.com/user/${username}/about`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "User-Agent": "FairDataUse/1.0.0",
        },
      },
    );

    if (!userResponse || typeof userResponse.status === 'undefined') {
      console.error(`[REDDIT] Invalid response from Reddit API for user '${username}'`);
      return false;
    }

    console.log(
      `[REDDIT] User verification response status: ${userResponse.status}`,
    );
    const verified = userResponse.ok;
    console.log(
      `[REDDIT] User '${username}' verification result: ${verified ? "VERIFIED" : "NOT FOUND"}`,
    );
    return verified;
  } catch (error) {
    console.error(
      `[REDDIT] Error verifying Reddit account '${username}':`,
      error,
    );
    return false;
  }
}

// Check if user already exists (separate endpoint)
export const handleCheckUserExists: RequestHandler = async (req, res) => {
  console.log("[API] ==================== CHECK USER EXISTS REQUEST ====================");
  console.log("[API] Request body:", JSON.stringify(req.body, null, 2));

  const client = getDatabase();

  try {
    // Handle case where body is a Buffer (serverless function issue)
    let parsedBody = req.body;
    console.log("[API] Raw req.body type:", typeof req.body);
    console.log("[API] Is Buffer:", Buffer.isBuffer(req.body));
    
    if (Buffer.isBuffer(req.body)) {
      console.log("[API] Body is Buffer, converting to string and parsing JSON");
      const bodyString = req.body.toString('utf8');
      console.log("[API] Body string:", bodyString);
      try {
        parsedBody = JSON.parse(bodyString);
        console.log("[API] Successfully parsed JSON from buffer:", parsedBody);
      } catch (parseError) {
        console.error("[API] Failed to parse JSON from buffer:", parseError);
        return res.status(400).json({
          success: false,
          message: "Invalid JSON in request body",
        });
      }
    } else if (typeof req.body === 'string') {
      console.log("[API] Body is string, parsing JSON");
      try {
        parsedBody = JSON.parse(req.body);
        console.log("[API] Successfully parsed JSON from string:", parsedBody);
      } catch (parseError) {
        console.error("[API] Failed to parse JSON from string:", parseError);
        return res.status(400).json({
          success: false,
          message: "Invalid JSON in request body",
        });
      }
    }
    
    const { email, phone } = parsedBody;
    console.log("[API] Extracted email:", email);
    console.log("[API] Extracted phone:", phone);

    if (!email || !phone) {
      console.log("[API] Missing email or phone - email:", !!email, "phone:", !!phone);
      return res.status(400).json({
        success: false,
        message: "Email and phone are required",
      });
    }

    // Check if user already exists (email + phone combination)
    console.log(`[API] Checking for existing user with email '${email}' and phone '${phone}'...`);
    const existingUserQuery = `
      SELECT id FROM users
      WHERE email = $1 AND phone = $2
    `;
    const existingUserResult = await client.query(existingUserQuery, [email, phone]);
    
    const userExists = existingUserResult.rows.length > 0;
    console.log("[API] User exists:", userExists ? "YES" : "NO");

    res.json({
      success: true,
      userExists,
    });

    console.log("[API] ==================== CHECK USER EXISTS COMPLETED ====================");
  } catch (error: any) {
    console.error("[API] Error checking user existence:", error);
    res.status(500).json({
      success: false,
      message: `Internal server error: ${error.message}`,
    });
  }
};

export const handleSocialQualifyForm: RequestHandler = async (req, res) => {
  console.log(
    "[API] ==================== SOCIAL QUALIFY FORM REQUEST ====================",
  );
  console.log("[API] Request method:", req.method);
  console.log("[API] Request headers:", JSON.stringify(req.headers, null, 2));
  console.log("[API] Request body:", JSON.stringify(req.body, null, 2));

  const client = getDatabase();

  try {
    // Handle case where body is a Buffer or string (serverless function issue)
    let parsedBody = req.body;
    console.log("[API] Raw req.body type:", typeof req.body);
    console.log("[API] Is Buffer:", Buffer.isBuffer(req.body));
    
    if (Buffer.isBuffer(req.body)) {
      console.log("[API] Body is Buffer, converting to string and parsing JSON");
      const bodyString = req.body.toString('utf8');
      console.log("[API] Body string:", bodyString);
      try {
        parsedBody = JSON.parse(bodyString);
        console.log("[API] Successfully parsed JSON from buffer:", parsedBody);
      } catch (parseError) {
        console.error("[API] Failed to parse JSON from buffer:", parseError);
        return res.status(400).json({
          success: false,
          message: "Invalid JSON in request body",
        });
      }
    } else if (typeof req.body === 'string') {
      console.log("[API] Body is string, parsing JSON");
      try {
        parsedBody = JSON.parse(req.body);
        console.log("[API] Successfully parsed JSON from string:", parsedBody);
      } catch (parseError) {
        console.error("[API] Failed to parse JSON from string:", parseError);
        return res.status(400).json({
          success: false,
          message: "Invalid JSON in request body",
        });
      }
    }

    console.log("[API] Validating request body with schema...");
    // Validate request body
    const validatedData = SocialQualifyFormSchema.parse(parsedBody);
    console.log(
      "[API] Request body validation successful:",
      JSON.stringify(validatedData, null, 2),
    );

    // Check if user already exists (email + phone combination)
    console.log(
      `[API] Checking for existing user with email '${validatedData.email}' and phone '${validatedData.phone}'...`,
    );
    const existingUserQuery = `
      SELECT id FROM users
      WHERE email = $1 AND phone = $2
    `;
    const existingUserResult = await client.query(existingUserQuery, [
      validatedData.email,
      validatedData.phone,
    ]);
    console.log(
      "[API] Existing user found:",
      existingUserResult.rows.length > 0 ? "YES" : "NO",
    );

    if (existingUserResult.rows.length > 0) {
      console.log("[API] User already exists, returning 400 error");
      return res.status(400).json({
        success: false,
        message:
          "A user with this email and phone number combination already exists.",
      } as SocialQualifyResponse);
    }

    // Verify Reddit account
    console.log("[API] Starting Reddit account verification...");
    const redditVerified = await verifyRedditAccount(
      validatedData.redditUsername,
    );
    console.log(
      `[API] Reddit verification completed. Verified: ${redditVerified}`,
    );

    // Return error if Reddit account doesn't exist
    if (!redditVerified) {
      console.log("[API] Reddit account not found, returning 400 error");
      return res.status(400).json({
        success: false,
        message: `Reddit user '${validatedData.redditUsername}' does not exist. Please check the username and try again.`,
      } as SocialQualifyResponse);
    }

    // Save to database using SQL INSERT
    console.log("[API] Saving user to database...");
    const insertUserQuery = `
      INSERT INTO users (email, phone, reddit_username, twitter_username, youtube_username, facebook_username, reddit_verified)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, created_at, updated_at
    `;
    const insertValues = [
      validatedData.email,
      validatedData.phone,
      validatedData.redditUsername,
      validatedData.twitterUsername || null,
      validatedData.youtubeUsername || null,
      validatedData.facebookUsername || null,
      redditVerified,
    ];

    const result = await client.query(insertUserQuery, insertValues);
    console.log(
      "[API] Database insert result:",
      JSON.stringify(result.rows[0], null, 2),
    );

    if (result.rows.length === 0) {
      console.error("[API] Database insert failed - no rows returned");
      throw new Error("Failed to save user to database");
    }
    console.log("[API] User saved successfully with ID:", result.rows[0].id);

    // Always return "rejected" but offer side-gigs marketplace
    console.log("[API] Preparing success response...");
    const response: SocialQualifyResponse = {
      success: true,
      message: "Application processed successfully",
      data: {
        matchedCompany: {
          name: "Silicon Valley Consulting",
          slug: "silicon-valley-consulting",
          payRate: "$2.00 per hour",
          bonus: "$500",
        },
      },
    };
    console.log("[API] Sending response:", JSON.stringify(response, null, 2));

    res.json(response);
    console.log(
      "[API] ==================== REQUEST COMPLETED SUCCESSFULLY ====================",
    );
  } catch (error: any) {
    console.error(
      "[API] ==================== ERROR OCCURRED ====================",
    );
    console.error("[API] Error type:", error.constructor.name);
    console.error("[API] Error message:", error.message);
    console.error("[API] Error stack:", error.stack);
    console.error(
      "[API] Full error object:",
      JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
    );

    if (error.issues) {
      // Zod validation errors
      console.error(
        "[API] Zod validation errors:",
        JSON.stringify(error.issues, null, 2),
      );
      const errorMessage = error.issues
        .map((issue: any) => issue.message)
        .join(", ");
      console.log(
        "[API] Sending 400 response for validation errors:",
        errorMessage,
      );
      return res.status(400).json({
        success: false,
        message: errorMessage,
      } as SocialQualifyResponse);
    }

    console.log("[API] Sending 500 response for internal server error");
    res.status(500).json({
      success: false,
      message: `Internal server error: ${error.message}`,
    } as SocialQualifyResponse);
    console.error(
      "[API] ==================== REQUEST FAILED ====================",
    );
  }
};
