import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import session from "express-session";
import { ObjectId } from "mongodb";
import logger from "morgan";
import cron from "node-cron";
import * as path from "path";




// The following line sets up the environment variables before everything else.
dotenv.config();

import MongoStore from "connect-mongo";
import { Listing, Listing_Expiring, Request_Expiring, Requesting } from "../server/app";
import { connectDb } from "../server/db";
import { appRouter } from "../server/routes";


export const app = express();
// Trust proxy so secure cookies work behind Vercel/Proxies
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
app.use(logger("dev"));

// Enable CORS with credentials so cookies can be sent from the frontend
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
); // https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS

app.use(express.json()); // Enable parsing JSON in requests and responses.
app.use(express.urlencoded({ extended: false })); // Also enable URL encoded request and responses.

// Session allows us to store a cookie 🍪.
app.use(
  session({
    secret: process.env.SECRET || "Hello 6.1040",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    },
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_SRV,
      dbName: "mongo-sessions",
    }),
  }),
);

app.use(express.static(path.join(__dirname, "../public")));
app.use("/api/", appRouter);

// For all unrecognized requests, return a not found message.
app.all("*", (req, res) => {
  res.status(404).json({
    msg: "Page not found",
  });
});

void connectDb().then(() => {
  app.listen(PORT, () => {
    console.log("Started listening on port", PORT);
  });
});


// Expiring schedule - runs every 5 minutes
cron.schedule("*/5 * * * *", async () => {
  console.log("=== CRON JOB STARTED ===");
  console.log(`Current time: ${new Date().toISOString()}`);
  
  try {
    await handleListingsExpired();
    await handleRequestsExpired();
    console.log("=== CRON JOB COMPLETED SUCCESSFULLY ===");
  } catch (error) {
    console.error("=== CRON JOB FAILED ===", error);
  }
});


// Function to handle expired listings
async function handleListingsExpired() {
  try {
    console.log("Starting expired listings processing...");
    const expiredDocs = await Listing_Expiring.getAllExpired();
    
    if (!expiredDocs || expiredDocs.length === 0) {
      console.log("No expired listings to process.");
      return;
    }

    console.log(`Found ${expiredDocs.length} expired listings to process.`);

    for (const doc of expiredDocs) {
      try {
        const itemOid = new ObjectId(doc.item);
        
        // Get the listing to check if it's still visible
        const listing = await Listing.getListingById(itemOid);
        
        // Only process if listing exists and is not already hidden
        if (listing && !listing.hidden) {
          console.log(`Hiding expired listing: ${listing.name} (ID: ${itemOid})`);
          
          // Hide the listing instead of deleting it
          await Listing.hideSwitch(itemOid);
          
          // Delete the expiration record to clean up
          await Listing_Expiring.delete(doc._id);
          
          console.log(`Successfully processed expired listing: ${listing.name}`);
        } else if (listing && listing.hidden) {
          // If listing is already hidden, just clean up the expiration record
          console.log(`Cleaning up expiration record for already hidden listing: ${listing.name}`);
          await Listing_Expiring.delete(doc._id);
        }
      } catch (error) {
        console.error(`Error processing expired listing ${doc.item}:`, error);
        // Continue processing other listings even if one fails
      }
    }
    
    console.log("Completed expired listings processing.");
  } catch (error) {
    console.error("Error in handleListingsExpired:", error);
  }
}

// Function to handle expired requests
async function handleRequestsExpired() {
  try {
    console.log("Starting expired requests processing...");
    const expiredDocs = await Request_Expiring.getAllExpired();
    
    if (!expiredDocs || expiredDocs.length === 0) {
      console.log("No expired requests to process.");
      return;
    }

    console.log(`Found ${expiredDocs.length} expired requests to process.`);

    for (const doc of expiredDocs) {
      try {
        const itemOid = new ObjectId(doc.item);
        
        // Get the request to check if it's still visible
        const request = await Requesting.getRequestById(itemOid);
        
        // Only process if request exists and is not already hidden
        if (request && !request.hidden) {
          console.log(`Hiding expired request: ${request.name} (ID: ${itemOid})`);
          
          // Hide the request instead of deleting it
          await Requesting.hideSwitch(itemOid);
          
          // Delete the expiration record to clean up
          await Request_Expiring.delete(doc._id);
          
          console.log(`Successfully processed expired request: ${request.name}`);
        } else if (request && request.hidden) {
          // If request is already hidden, just clean up the expiration record
          console.log(`Cleaning up expiration record for already hidden request: ${request.name}`);
          await Request_Expiring.delete(doc._id);
        }
      } catch (error) {
        console.error(`Error processing expired request ${doc.item}:`, error);
        // Continue processing other requests even if one fails
      }
    }
    
    console.log("Completed expired requests processing.");
  } catch (error) {
    console.error("Error in handleRequestsExpired:", error);
  }
}


export default app;