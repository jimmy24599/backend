import express from 'express';
import dotenv from "dotenv";
import { connectDB } from './Config/db.js';
//Modals import
import Customer from "./models/customer.model.js"; // Import the model
import Services from './models/services.model.js'; // Import the Service model
import Request from './models/request.model.js'; // Import Requess model
import Bid from "./models/bid.model.js"; // Import bid model
import ServiceProvider from "./models/provider.model.js"; // Import the ServiceProvider model
import Review from './models/review.model.js'; //Import review  model
import Chat from './models/chat.model.js'; //import chat model
import Message from './models/message.model.js'; //import message model
import Notification from './models/notification.model.js';



import cors from 'cors'; 
import compression from 'compression';
import mongoose from "mongoose"
import sanitize from 'sanitize-html';

//Chat Typing Indicator
import http from 'http';
import { Server } from 'socket.io';
const activeChats = {};
import upload from './upload.js';

//Payment
import Stripe from 'stripe';
import Transaction from './models/transaction.model.js';
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);



//For account deletion
import { clerkClient } from '@clerk/clerk-sdk-node';

//aiAssistant 
import { setupAIAssistant } from './aiAssistant.js';





dotenv.config();


//email
import { sendEmail } from './email.js';




const app = express();
app.use(compression()); // ✅ Reduces response size
const server = http.createServer(app); // assuming 'app' is your Express app
const io = new Server(server, {
  cors: {
    origin: "*", // Allow frontend access
    methods: ["GET", "POST"]
  }
});

app.set('io', io);

// Middleware setup
app.use(cors({
  origin: [
    'http://localhost:3000', // Expo web port
    'exp://192.168.112.164:3000', // Your local IP URL
    'https://backend-zsxc.vercel.app/' // Production app URL
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));



app.use(express.json());
console.log("🔍 MONGO_URI:", process.env.MONGO_URI);
// Database connection and server startup
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();
    console.log('✅ MongoDB connected');

    // Basic health check
    app.get('/', (req, res) => {
      res.status(200).json({
        status: 'active',
        message: 'Servibid Backend Running',
        timestamp: new Date().toISOString()
      });
    });
    app.get('/health-check', (req, res) => {
      res.status(200).send('Server OK');
    });



    

    //AWS


const fileFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("audio/") ||
    file.mimetype.startsWith("video/")
  ) {
    cb(null, true);
  } else {
    cb(new Error("Unsupported file type"), false);
  }
};




// Ai Assistant 
setupAIAssistant(app);

//account deletion start
app.delete("/api/dev/delete-user/:email", async (req, res) => {
  const email = req.params.email?.toLowerCase().trim();
  console.log("🧨 Deleting user with email:", email);

  try {
    // Search all users
    const result = await clerkClient.users.getUserList({ limit: 100 });
    const users = result?.data || result || [];

    // Log all found emails
    const foundEmails = users.map(u => u.emailAddresses?.[0]?.emailAddress);
    console.log("📬 All Clerk Emails:", foundEmails);

    const matchedUser = users.find(u =>
      u.emailAddresses?.some(e => e.emailAddress.toLowerCase() === email)
    );

    if (!matchedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found in Clerk."
      });
    }

    // Delete from Clerk
    await clerkClient.users.deleteUser(matchedUser.id);

    // Delete from MongoDB
    const deletedCustomer = await Customer.findOneAndDelete({ email });
    const deletedProvider = await ServiceProvider.findOneAndDelete({ email });

    res.json({
      success: true,
      message: "User deleted.",
      deletedFrom: {
        clerk: true,
        mongoDB: !!(deletedCustomer || deletedProvider)
      }
    });
  } catch (err) {
    console.error("❌ Delete error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

//account deletion ends




app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  res.status(200).json({
    success: true,
    fileUrl: req.file.location // this is the S3 public URL
  });
});


// Update customer details by email
app.put('/customer/:email', async (req, res) => {
  try {
    const customer = await Customer.findOne({ email: req.params.email });

    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const { first_name, last_name, location } = req.body;

    if (first_name) customer.first_name = first_name;
    if (last_name) customer.last_name = last_name;
    if (location) customer.location = location; // <- Ensure it's correctly assigned

    await customer.save();

    res.status(200).json({ success: true, message: 'Customer updated', data: customer });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



// Fetch customer details by email
app.get("/customer/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const customer = await Customer.findOne({ email });
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found." });
    }
    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    console.error("Error fetching customer:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
    console.log('📦 Customer fetch query:', { email: req.params.email });
    console.log('🔍 Found customer:', Customer?Customer.role : 'Not found');
});

// Customer registration endpoint
app.post("/customer", async (req, res) => {
  const customer = req.body; // Customer data from request body

  if (!customer.first_name || !customer.last_name || !customer.email) {
    return res.status(400).json({ success: false, message: "Please provide all fields." });
  }

  try {
    // Check if customer already exists
    const existingCustomer = await Customer.findOne({ email: customer.email });
    if (existingCustomer) {
      return res.status(400).json({ success: false, message: "Customer already exists." });
    }

    // Create new customer
    const newCustomer = new Customer(customer);
    await newCustomer.save();

    res.status(201).json({ success: true, data: newCustomer });

  } catch (error) {
    console.error("Error in creating new customer:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

//Fetch services by category (Moved Outside)
app.get("/services/:category", async (req, res) => {
  const { category } = req.params;

  try {
    const services = await Services.find({ category });
    res.status(200).json({ success: true, data: services });
  } catch (error) {
    console.error("Error fetching services:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Create a new request
app.post('/request', upload.single('image'), async (req, res) => {
  try {
    const { customerID, service, date, description, budget, state } = req.body;

    if (!customerID || !service || !date || !description || !budget) {
      return res.status(400).json({ success: false, message: 'Please fill out all fields.' });
    }

    let details = {};
    if (req.body.details && typeof req.body.details === 'string') {
      try {
        details = JSON.parse(req.body.details);
      } catch (err) {
        console.warn('⚠️ Failed to parse details:', err.message);
      }
    }

    let location = null;
    if (req.body.location && typeof req.body.location === 'string') {
      try {
        location = JSON.parse(req.body.location);
      } catch (err) {
        console.warn('⚠️ Failed to parse location:', err.message);
      }
    }

    const newRequest = new Request({
      customerID,
      service,
      date,
      description,
      budget,
      state,
      image: req.file?.location, // S3 image URL
      details, // Parsed details here
      location, 
    });

    await newRequest.save();
    const customer = await Customer.findById(customerID);
    if (customer?.email) {
      await sendEmail({
        to: customer.email,
        subject: `Your ${service} request has been submitted!`,
        html: `
            <div style="max-width: 600px; margin: auto; padding: 20px; font-family: Arial, sans-serif; background: #f9f9f9; border-radius: 12px; border: 1px solid #eee;">
              <h2 style="color: #FE4D00; text-align: center;">🛠️ ServiBid</h2>
              <p style="font-size: 16px;">Hi ${customer.first_name || 'there'},</p>

              <p style="font-size: 16px;">Your request for <strong>${service}</strong> has been submitted successfully!</p>

              <div style="background: #fff; padding: 15px 20px; margin: 20px 0; border-radius: 10px; box-shadow: 0 1px 4px rgba(0,0,0,0.05);">
                <p><strong>🛎️ Service:</strong> ${service}</p>
                <p><strong>📅 Date:</strong> ${new Date(date).toLocaleString()}</p>
                <p><strong>💰 Budget:</strong> AED ${budget}</p>
                <p><strong>📝 Notes:</strong> ${description}</p>
              </div>

              <p style="font-size: 15px;">We’ll notify you as soon as service providers start placing bids.</p>

              <a href="https://servibid.tech/app/requests" target="_blank"
                style="display: inline-block; margin-top: 20px; background: #FE4D00; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                🔎 View Your Requests
              </a>

              <p style="margin-top: 30px; font-size: 13px; color: #888; text-align: center;">
                Thank you for using ServiBid 🙏<br/>
                Need help? Contact us at support@servibid.tech
              </p>
            </div>
          `
      });
    }

    // 🔔 Notify Customer
    const customerNotification = await Notification.create({
      user: customerID,
      type: 'request_created',
      message: `Your request for ${service} has been scheduled successfully.`,
      meta: {
        requestId: newRequest._id
      }
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`customer:${customerID}`).emit("notification", customerNotification);
    }

    // 🔔 Notify Providers offering this service
    const matchingProviders = await ServiceProvider.find({
      service: { $in: [newRequest.service] }
    });
    console.log("🔍 Found Providers:", matchingProviders.length);

    for (const provider of matchingProviders) {
      console.log(`👤 Provider ID: ${provider._id}`);
      console.log(`📧 Email: ${provider.email}`);
      console.log(`🧰 Services: ${provider.service}`);
      if (provider.email) {
        await sendEmail({
          to: provider.email,
          subject: `New ${newRequest.service} request in your area!`,
          html: `
            <div style="max-width: 600px; margin: auto; padding: 20px; font-family: Arial, sans-serif; background: #fefefe; border-radius: 12px; border: 1px solid #eee;">
              <h2 style="color: #FE4D00; text-align: center;">🚨 New Job Alert – ServiBid</h2>

              <p style="font-size: 16px;">Hi ${provider.name || 'there'},</p>

              <p style="font-size: 15px;">
                A new <strong>${newRequest.service}</strong> request has just been posted in your service category.
                This could be your next opportunity!
              </p>

              <div style="background: #fff; padding: 15px 20px; margin: 20px 15px 20px 0; border-radius: 10px; border: 1px solid #ddd;">
                <p><strong>📋 Service:</strong> ${newRequest.service}</p>
                <p><strong>💰 Budget:</strong> AED ${newRequest.budget}</p>
                <p><strong>📅 Date:</strong> ${new Date(newRequest.date).toLocaleString()}</p>
                <p><strong>📝 Notes:</strong> ${newRequest.description || 'No additional notes provided.'}</p>
              </div>

              <a href="https://servibid.tech/app/jobs" target="_blank"
                style="display: inline-block; margin-top: 20px; background: #FE4D00; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
                🚀 View Request & Place Bid
              </a>

              <p style="margin-top: 30px; font-size: 13px; color: #888; text-align: center;">
                Stay fast to win the bid — customers often accept the first best offer. 💪<br/>
                Thank you for being part of ServiBid!
              </p>
            </div>
          `
        });
      }
      const providerNotification = await Notification.create({
        user: provider._id,
        type: 'request_created',
        message: `🚨 A new request for **${newRequest.service}** was just posted.`,
        meta: {
          requestId: newRequest._id,
          customerId: newRequest.customerID
        }
      });

      if (io) {
        io.to(`provider:${provider._id}`).emit("notification", providerNotification);
      }
    }

    res.status(201).json({ success: true, data: newRequest });
  } catch (error) {
    console.error('❌ Error creating request:', error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});



// Fetch requests by customer ID
app.get("/requests/:customerID", async (req, res) => {
  const { customerID } = req.params;

  try {
    const requests = await Request.find({ customerID });
    
    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error("Error fetching requests:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.get("/serviceProvider/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const provider = await ServiceProvider.findById(id);
    if (!provider) {
      return res.status(404).json({ success: false, message: "Provider not found." });
    }

    res.status(200).json({ success: true, data: provider });
  } catch (error) {
    console.error("Error fetching service provider:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});


//Delete Request
app.delete("/requests/:id", async (req, res) => {
  try {
    const requestId = req.params.id;

    const deletedRequest = await Request.findByIdAndDelete(requestId);
    if (!deletedRequest) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    res.status(200).json({ success: true, message: "Request deleted successfully", data: deletedRequest });
  } catch (error) {
    console.error("Error deleting request:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// Fetch bids by request ID
app.get("/bids/:requestId", async (req, res) => {
  const { requestId } = req.params;

  try {
    const bids = await Bid.find({ requestId });

    if (!bids.length) {
      return res.status(200).json({ success: true, data: [] }); // Return empty array instead of 404
    }

    // Fetch service provider details based on providerName (case-insensitive)
    const populatedBids = await Promise.all(
      bids.map(async (bid) => {
        try {
          const provider = await ServiceProvider.findById(bid.providerId);

          return {
            ...bid.toObject(),
            serviceProvider: provider
              ? {
                  _id: provider._id,
                  name: provider.name,
                  rating: provider.rating,
                  description: provider.description,
                  image: provider.image, 
                  phone: provider.phone,
                }
              : { _id: null, name: "Unknown Provider", rating: 0, description: "" }, 
          };
        } catch (error) {
          console.error(`Error fetching provider for bid ${bid._id}:`, error);
          return {
            ...bid.toObject(),
            serviceProvider: { _id: null, name: "Unknown Provider", rating: 0, description: "" },
          };
        }
      })
    );

    res.status(200).json({ success: true, data: populatedBids });
  } catch (error) {
    console.error("Error fetching bids:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});


//Provider update + calculate rating
app.get("/provider-average-rating/:providerId", async (req, res) => {
  const { providerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(providerId)) {
    return res.status(400).json({ success: false, message: "Invalid provider ID" });
  }

  try {
    const result = await Review.aggregate([
      { $match: { providerId: new mongoose.Types.ObjectId(providerId) } },
      {
        $group: {
          _id: null,
          averageRating: { $avg: "$rating" },
          totalRatings: { $sum: 1 }
        }
      }
    ]);

    const averageRating = result[0]?.averageRating || 0;
    const totalRatings = result[0]?.totalRatings || 0;

    // Optionally update the provider's rating field
    await ServiceProvider.findByIdAndUpdate(providerId, {
      rating: averageRating
    });

    res.json({
      success: true,
      averageRating: parseFloat(averageRating.toFixed(2)),
      totalRatings
    });
  } catch (error) {
    console.error("Error calculating average rating:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


//Provider Leaderboard + Badges
app.get("/provider-leaderboard", async (req, res) => {
  try {
    // Get top providers by jobsDone and rating
    const topProviders = await ServiceProvider.find({})
      .sort({ jobsDone: -1, rating: -1 }) // Highest jobs first, then rating
      .limit(10) // Top 10
      .select("name service rating jobsDone badges rank") // Only send needed fields

    res.status(200).json({
      success: true,
      data: topProviders
    });
  } catch (err) {
    console.error("Error fetching leaderboard:", err)
    res.status(500).json({
      success: false,
      message: "Failed to fetch leaderboard"
    });
  }
});

//Auto-assign badges:
app.put("/auto-assign-badges", async (req, res) => {
  try {
    const providers = await ServiceProvider.find();

    const updates = await Promise.all(providers.map(async (provider) => {
      const badges = [];
      let rank = "Unranked";

      if (provider.jobsDone >= 100) badges.push("100 Jobs Completed");
      if (provider.rating >= 4.5) badges.push("5-Star Streak");
      if (provider.revenue > 10000) badges.push("Revenue Pro");
      if (provider.jobsDone >= 50 && provider.rating >= 4.7) badges.push("Superfast Responder");

      if (provider.jobsDone >= 100) rank = "Top 10 in " + (provider.service || "Category");

      return Provider.findByIdAndUpdate(
        provider._id,
        { badges, rank },
        { new: true }
      );
    }));

    res.json({ success: true, message: "Badges and ranks assigned", data: updates });
  } catch (err) {
    console.error("Auto badge assign error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//Get provider rank + badges
app.get("/provider-rank-badges/:id", async (req, res) => {
  try {
    const provider = await ServiceProvider.findById(req.params.id);

    if (!provider) {
      return res.status(404).json({ success: false, message: "Provider not found" });
    }

    res.json({
      success: true,
      data: {
        rank: provider.rank || "Unranked",
        badges: provider.badges || []
      }
    });
  } catch (err) {
    console.error("Error fetching provider badges:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// Fetch service provider details by email
app.get("/provider/:email", async (req, res) => {
  const { email } = req.params;
  console.log("Searching for provider with email:", email); // Debug log

  try {
    const allProviders = await ServiceProvider.find();
    console.log("All Providers in DB:", allProviders.map(p => p.email)); // Log all emails in DB

    const provider = await ServiceProvider.findOne({
      email: email.trim().toLowerCase(), // Force match without regex
    });

    if (!provider) {
      console.log("Provider not found in DB"); // Debugging log
      return res.status(404).json({ success: false, message: "Provider not found." });
    }

    res.status(200).json({ success: true, data: provider });
  } catch (error) {
    console.error("Error fetching service provider:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.get("/available-requests", async (req, res) => {
  let { service } = req.query;

  console.log("🛠️ Raw incoming service:", service);
  service = service?.trim(); // remove accidental spaces
  console.log("🔍 Trimmed service:", service);

  if (!service || typeof service !== "string") {
    return res.status(400).json({ success: false, message: "Service is required." });
  }

  try {
    const matchingRequests = await Request.find({
      service,
      state: "in-progress",
    });

    console.log("✅ Matched requests:", matchingRequests.length);
    if (!matchingRequests.length) {
      return res.status(200).json({ success: false, message: "No matching requests found." });
    }

    return res.status(200).json({ success: true, data: matchingRequests });
  } catch (error) {
    console.error("❌ Error fetching available requests:", error.message);
    return res.status(500).json({ success: false, message: "Server error." });
  }
});


// GET /revenue-history/:providerId
app.get("/revenue-history/:providerId", async (req, res) => {
  try {
    const { providerId } = req.params;
    const requests = await Request.find({
      providerId,
      state: "done",
    });

    const monthlyRevenue = {};

    for (let req of requests) {
      const date = new Date(req.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyRevenue[key]) monthlyRevenue[key] = 0;
      monthlyRevenue[key] += req.price;
    }

    const result = Object.keys(monthlyRevenue)
      .sort()
      .map((key) => ({
        month: new Date(key + "-01").toLocaleString("default", { month: "short" }),
        total: monthlyRevenue[key],
      }));

    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});





// Fetch requests by provider ID
app.get("/requests-by-provider/:providerId", async (req, res) => {
  const { providerId } = req.params;

  try {
    const requests = await Request.find({ providerId })
      .populate("customerID"); // ✅ ADD THIS

    if (!requests.length) {
      return res.status(404).json({ success: false, message: "No active requests found for this provider." });
    }

    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error("Error fetching requests by provider:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});


//Calculate revenue
app.get('/total-revenue/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;

    const requests = await Request.find({
      providerId,
      state: 'done',
      paid: true
    });

    const totalRevenue = requests.reduce((sum, req) => sum + (req.price || 0), 0);

    res.json({ success: true, totalRevenue });
  } catch (err) {
    console.error("Error calculating total revenue:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//Fetch revenues by month
app.get("/monthly-revenue/:providerId", async (req, res) => {
  try {
    const { providerId } = req.params;

    const monthlyData = await Request.aggregate([
      {
        $match: {
          providerId,
          state: "done",
          paid: true,
        },
      },
      {
        $group: {
          _id: { $month: "$date" },
          total: { $sum: "$price" },
        },
      },
      {
        $sort: { _id: 1 }, // Jan to Dec
      },
    ]);

    // Convert numeric months to month names
    const monthNames = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const result = monthNames.map((name, index) => {
      const found = monthlyData.find((m) => m._id === index + 1);
      return {
        month: name,
        total: found ? found.total : 0,
      };
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error("Error getting monthly revenue:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// Get services by provider category
app.get("/services-by-category/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const services = await Services.find({ category });
    res.status(200).json({ success: true, data: services });
  } catch (error) {
    console.error("Error fetching services:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

app.post("/requests", async (req, res) => {
  try {
      const { services } = req.body;
      if (!services || services.length === 0) {
          return res.json({ success: false, message: "No services provided." });
      }

      const matchingRequests = await Request.find({ service: { $in: services } });
      res.json({ success: true, data: matchingRequests });
  } catch (error) {
      console.error("Error fetching requests:", error);
      res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

app.get('/available-requests', async (req, res) => {
  try {
      // Handle services as both arrays and comma-separated strings
      const services = Array.isArray(req.query.services) 
          ? req.query.services 
          : req.query.services?.split(',').filter(Boolean) || [];

      if (services.length === 0) {
          return res.status(400).json({ success: false, message: "Invalid services parameter" });
      }

      const availableRequests = await Request.find({
          service: { $in: services },
          $or: [ 
            { providerId: null }, 
            { providerId: "" }, 
            { providerId: { $exists: false } } 
          ]
      });

      res.json({ success: true, data: availableRequests });
  } catch (error) {
      console.error("Error fetching available requests:", error);
      res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/place-bid", async (req, res) => {
  const { requestId, providerId, price, description } = req.body;

  if (!requestId || !providerId || !price) {
    return res.status(400).json({ success: false, message: "Missing required fields." });
  }

  try {
    const request = await Request.findById(requestId);
    if (!request) {
      return res.status(404).json({ success: false, message: "Request not found." });
    }

    const provider = await ServiceProvider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ success: false, message: "Service provider not found." });
    }

    const newBid = new Bid({
      requestId,
      providerId,
      price,
      description,
    });

    await newBid.save();
    const customer = await Customer.findById(request.customerID);
    if (customer?.email) {
      await sendEmail({
        to: customer.email,
        subject: `New bid received on your ${request.service} request!`,
        html: `
          <div style="max-width: 600px; margin: auto; padding: 20px; font-family: Arial, sans-serif; background: #fefefe; border-radius: 12px; border: 1px solid #eee;">
            <h2 style="color: #FE4D00; text-align: center;">💰 New Bid Received – ServiBid</h2>

            <p style="font-size: 16px;">Hi ${customer.first_name || 'there'},</p>

            <p style="font-size: 15px;"><strong>${provider.name}</strong> has placed a new bid on your <strong>${request.service}</strong> request.</p>

            <div style="background: #fff; padding: 15px 20px; margin: 20px 15px 20px 0; border-radius: 10px; border: 1px solid #ddd;">
              <p><strong>💵 Bid Amount:</strong> AED ${price}</p>
              <p><strong>📝 Message:</strong> ${description || 'No message provided.'}</p>
            </div>

            <a href="https://servibid.tech/app/requests" target="_blank"
              style="display: inline-block; margin-top: 20px; background: #FE4D00; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              🔍 View All Bids
            </a>

            <p style="margin-top: 30px; font-size: 13px; color: #888; text-align: center;">
              Compare bids carefully and accept the best fit for your service. Thanks for using ServiBid!
            </p>
          </div>
        `,
      });
    }

    if (provider?.email) {
      await sendEmail({
        to: provider.email,
        subject: `Your bid for ${request.service} was placed successfully!`,
        html: `
          <div style="max-width: 600px; margin: auto; padding: 20px; font-family: Arial, sans-serif; background: #fefefe; border-radius: 12px; border: 1px solid #eee;">
            <h2 style="color: #FE4D00; text-align: center;">✅ Bid Placed Successfully</h2>

            <p style="font-size: 16px;">Hi ${provider.name || 'there'},</p>

            <p style="font-size: 15px;">Your bid has been submitted successfully for the <strong>${request.service}</strong> request.</p>

            <div style="background: #fff; padding: 15px 20px; margin: 20px 15px 20px 0; border-radius: 10px; border: 1px solid #ddd;">
              <p><strong>💵 Amount:</strong> AED ${price}</p>
              <p><strong>📝 Message:</strong> ${description || 'No message provided.'}</p>
              <p><strong>🧾 Request ID:</strong> ${request._id}</p>
            </div>

            <p style="font-size: 15px;">We’ll notify you if the customer accepts your offer. Stay tuned!</p>

            <a href="https://servibid.tech/app/services" target="_blank"
              style="display: inline-block; margin-top: 20px; background: #FE4D00; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              🧮 Manage Bids
            </a>

            <p style="margin-top: 30px; font-size: 13px; color: #888; text-align: center;">
              Thank you for being a trusted service provider on ServiBid.
            </p>
          </div>
        `
      });
    }

    // Emit via Socket.IO
    const io = req.app.get("io");
    if (io) {
      io.to(`customer:${request.customerID}`).emit("newBid", { requestId: newBid.requestId });
      // Also emit notification
      const notification = await Notification.create({
        user: request.customerID,
        type: "new_bid",
        message: `💰 ${provider.name} placed a new bid on your request for ${request.service}.`,
        meta: { requestId, providerId, bidId: newBid._id }
      });

      io.to(`customer:${request.customerID}`).emit("notification", notification);
    }

    res.status(201).json({ success: true, message: "Bid placed successfully!", data: newBid });
  } catch (error) {
    console.error("Error placing bid:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});


//Mark bids as seen
app.put('/bids/mark-seen/:requestId', async (req, res) => {
  try {
    const requestId = req.params.requestId;
    await Bid.updateMany({ requestId, seen: false }, { seen: true });
    res.status(200).json({ success: true, message: "Bids marked as seen" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to mark bids as seen" });
  }
});



app.put("/requests/:id", async (req, res) => {
  try {
    const { price, providerId, reviewId, image } = req.body;
    const updateData = {};

    if (price !== undefined) updateData.price = price;
    if (providerId !== undefined) updateData.providerId = providerId;
    if (providerId !== undefined) updateData.paid = false;
    if (reviewId !== undefined) updateData.reviewId = reviewId;
    if (image !== undefined) updateData.image = image; // ✅ add this

    const updatedRequest = await Request.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    // Notify provider if they were assigned
    if (providerId) {
      const provider = await ServiceProvider.findById(providerId);
      if (provider) {
        const notification = await Notification.create({
          user: providerId,
          type: 'bid_accepted',
          message: `✅ Your bid on **${updatedRequest.service}** was accepted by a customer.`,
          meta: { requestId: req.params.id, customerId: updatedRequest.customerID }
        });

        const io = req.app.get("io");
        if (io) {
          io.to(`provider:${providerId}`).emit("notification", notification);
        }
      }
    }

    res.json({ success: true, data: updatedRequest });
  } catch (error) {
    console.error("Error updating request:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


app.put("/requests/:id/state", async (req, res) => {
  try {
    const { state } = req.body; // Get state from request body
    const updatedRequest = await Request.findByIdAndUpdate(
      req.params.id,
      { state }, // Update state field
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    res.json({ success: true, data: updatedRequest });
  } catch (error) {
    console.error("Error updating request state:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});




// Get customer by ID
app.get("/customer-by-id/:id", async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found." });
    }
    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    console.error("Error fetching customer:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});


// Create review
// Update the reviews creation endpoint
app.post('/reviews', async (req, res) => {
  try {
    const { rating, title, comment, requestId, providerId, customerId } = req.body;

    if (!rating || !title || !comment || !requestId || !providerId || !customerId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const newReview = new Review({ rating, title, comment, requestId, providerId, customerId });
    const savedReview = await newReview.save();

    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      { reviewId: savedReview._id },
      { new: true }
    );

    if (!updatedRequest) {
      await Review.findByIdAndDelete(savedReview._id);
      return res.status(404).json({ success: false, message: 'Associated request not found' });
    }

    const request = await Request.findById(requestId);
    const reviewedService = request?.service || 'your service';

    const notification = await Notification.create({
      user: providerId,
      type: 'review_received',
      message: `🌟 You received a new review for ${reviewedService} from a customer.`,
      meta: { reviewId: savedReview._id, customerId }
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`provider:${providerId}`).emit("notification", notification);
    }

    res.status(201).json({ success: true, data: savedReview });
  } catch (error) {
    console.error('Error creating review:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update the request update endpoint
app.put("/requests/:id", async (req, res) => {
  try {
    const { price, providerId, reviewId } = req.body;
    const updateData = {};
    
    if (price !== undefined) updateData.price = price;
    if (providerId !== undefined) updateData.providerId = providerId;
    if (reviewId !== undefined) updateData.reviewId = reviewId;

    const updatedRequest = await Request.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ success: false, message: "Request not found" });
    }

    res.json({ success: true, data: updatedRequest });
  } catch (error) {
    console.error("Error updating request:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//Fetch reviews
app.get("/provider-reviews/:providerId", async (req, res) => {
  try {
    const { providerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const sort = req.query.sort || "newest"; // "newest", "highest", "lowest"

    if (!mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({ success: false, message: "Invalid provider ID" });
    }

    const sortOptions = {
      newest: { createdAt: -1 },
      oldest: { createdAt: 1 },
      highest: { rating: -1 },
      lowest: { rating: 1 },
    };

    const reviews = await Review.find({ providerId })
      .populate("customerId", "firstName lastName")
      .sort(sortOptions[sort])
      .skip((page - 1) * limit)
      .limit(limit);

    const totalReviews = await Review.countDocuments({ providerId });
    const averageRating = await Review.aggregate([
      { $match: { providerId: new mongoose.Types.ObjectId(providerId) } },
      { $group: { _id: null, avg: { $avg: "$rating" } } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        reviews,
        total: totalReviews,
        averageRating: averageRating[0]?.avg || 0,
        page,
        totalPages: Math.ceil(totalReviews / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//Check if there is a review for that request
app.post('/reviews/existence', async (req, res) => {
  try {
    const requestIds = req.body.requestIds.map(id => new mongoose.Types.ObjectId(id));
    const reviews = await Review.find({
      requestId: { $in: requestIds }
    }).select('requestId -_id');
    
    res.json({ success: true, data: reviews });
  } catch (error) {
    console.error('Error fetching review existence:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



// ======================
// Chat Endpoints
// ======================

// Middleware to check chat participation
// Change this middleware
const isParticipant = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const userId = req.headers['user-id'];
    
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    const participants = [
      chat.customerId.toString(),
      chat.providerId.toString()
    ];

    if (!participants.includes(userId.toString())) {
      return res.status(403).json({ success: false, message: 'Not a participant' });
    }

    req.chat = chat;
    next();
  } catch (error) {
    console.error('Middleware error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// Create new chat
app.post('/chats', async (req, res) => {
  try {
    const { customerId, providerId } = req.body;
    console.log('Chat creation request:', req.body);

    // Validate request format
    if (!customerId || !providerId) {
      return res.status(400).json({
        success: false,
        message: "Both customerId and providerId are required",
        errorCode: "MISSING_IDS"
      });
    }

    // Validate MongoDB ID format
    if (!mongoose.Types.ObjectId.isValid(customerId) || 
        !mongoose.Types.ObjectId.isValid(providerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
        errorCode: "INVALID_ID_FORMAT"
      });
    }

    // Check if participants exist
    const [customer, provider] = await Promise.all([
      Customer.findById(customerId),
      ServiceProvider.findById(providerId)
    ]);

    if (!customer || !provider) {
      return res.status(400).json({
        success: false,
        message: "Customer or provider not found",
        errorCode: "PARTICIPANT_NOT_FOUND"
      });
    }

    // Check for existing chat (both directions)
    const existingChat = await Chat.findOne({
      $or: [
        { customerId, providerId },
        { customerId: providerId, providerId: customerId }
      ]
    });

    if (existingChat) {
      return res.status(200).json({
        success: true,
        data: existingChat,
        message: "Existing chat found"
      });
    }

    // Create new chat
    const newChat = new Chat({
      customerId,
      providerId,
      last_message: "Chat started"
    });

    await newChat.save();

    res.status(201).json({
      success: true,
      data: newChat,
      message: "New chat created"
    });
    const io = req.app.get('io');
      if (io) {
        io.to(`provider:${newChat.providerId}`).emit('newChat', {
          ...newChat.toObject(),
          otherParticipant: customer
        });
        
        io.to(`customer:${newChat.customerId}`).emit('newChat', {
          ...newChat.toObject(),
          otherParticipant: provider
        });
      }

  } catch (error) {
    console.error('Chat creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      errorCode: "SERVER_ERROR"
    });
  }
});

// Get user's chats
app.get('/chats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const chats = await Chat.find({
      $or: [
        { customerId: userId },
        { providerId: userId }
      ]
    })
    .sort({ updatedAt: -1 })
    .lean();

    // Get unread counts and participant details
    const chatsWithDetails = await Promise.all(
      chats.map(async (chat) => {
        const isCustomer = chat.customerId.toString() === userId;
        const otherId = isCustomer ? chat.providerId : chat.customerId;
        
        // Get participant details
        const participant = await ServiceProvider.findById(otherId) || 
                          await Customer.findById(otherId);

        // Calculate unread messages
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          receiverId: userId,
          seen: false
        });

        return {
          ...chat,
          otherParticipant: {
            _id: otherId,
            name: participant?.name || 'Unknown User',
            role: isCustomer ? 'provider' : 'customer'
          },
          unreadCount // Add the unread count here
        };
      })
    );

    res.json({ success: true, data: chatsWithDetails });
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Send message
// Send message endpoint
app.post('/chats/:chatId/messages', isParticipant, async (req, res) => {
  try {
    const { text, fileUrl, fileName, fileSize, fileType, type, duration } = req.body;
    const chat = req.chat;
    const senderId = req.headers['user-id'];

    if (!senderId || (!text && !fileUrl)) {
      return res.status(400).json({ success: false, message: 'Missing content' });
    }

    const cleanedText = text ? sanitize(text, { allowedTags: [], allowedAttributes: {} }) : '';

    const receiverId = chat.customerId.toString() === senderId ? chat.providerId : chat.customerId;

    const newMessage = new Message({
      senderId,
      receiverId,
      chatId: chat._id,
      text,
      fileUrl,
      fileName,
      fileType,
      fileSize,
      duration,
      seen: false,
      type,
    });

    await newMessage.save();
    const lastMessageSummary = type === 'text' ? text : '📎 Attachment received';
    await Chat.findByIdAndUpdate(chat._id, {
      last_message: lastMessageSummary,
      updatedAt: new Date(),
    });
    const notification = await Notification.create({
      user: receiverId,
      type: 'new_message',
      message: `New message received`,
      meta: { chatId: chat._id, senderId }
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`customer:${receiverId}`).emit("notification", notification);
      io.to(`provider:${receiverId}`).emit("notification", notification);
      io.to(chat._id.toString()).emit("newMessage", newMessage);

    }

    await Chat.findByIdAndUpdate(chat._id, {
      last_message: text,
      updatedAt: new Date()
    });

    if (io) {
      const [providerUnread, customerUnread] = await Promise.all([
        Message.countDocuments({ chatId: chat._id, receiverId: chat.providerId, seen: false }),
        Message.countDocuments({ chatId: chat._id, receiverId: chat.customerId, seen: false }),
      ]);
    
      const updatedAt = new Date().toISOString();
    
      io.to(`provider:${chat.providerId}`).emit('chatUpdate', {
        chatId: chat._id.toString(),
        unreadCount: providerUnread,
        last_message: text,
        updatedAt
      });
    
      io.to(`customer:${chat.customerId}`).emit('chatUpdate', {
        chatId: chat._id.toString(),
        unreadCount: customerUnread,
        last_message: text,
        updatedAt
      });
    }

    res.status(201).json({ success: true, data: newMessage });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});



// Get chat messages
app.get('/chats/:chatId/messages', isParticipant, async (req, res) => {
  try {
    // ✅ Fetch the chat from DB first
    const chat = await Chat.findById(req.params.chatId);
    if (!chat) {
      return res.status(404).json({ success: false, message: 'Chat not found' });
    }

    // ✅ Fetch messages for this chat
    const messages = await Message.find({ chatId: req.params.chatId })
      .sort({ createdAt: 1 })
      .lean();
    
    // Emit updates
    const io = req.app.get('io');
    if (io) {
      const [providerUnread, customerUnread] = await Promise.all([
        Message.countDocuments({
          chatId: chat._id,
          receiverId: chat.providerId,
          seen: false
        }),
        Message.countDocuments({
          chatId: chat._id,
          receiverId: chat.customerId,
          seen: false
        })
      ]);

      const updatedAt = new Date().toISOString();

      io.to(`provider:${chat.providerId}`).emit('chatUpdate', {
        chatId: chat._id.toString(),
        unreadCount: providerUnread,
        last_message: messages[messages.length - 1]?.text || '',
        updatedAt
      });

      io.to(`customer:${chat.customerId}`).emit('chatUpdate', {
        chatId: chat._id.toString(),
        unreadCount: customerUnread,
        last_message: messages[messages.length - 1]?.text || '',
        updatedAt
      });

      console.log(`📢 Emitted updates to both participants`);
    }

    console.log(`Found ${messages.length} messages for chat ${req.params.chatId}`);
    res.json({ success: true, data: messages });

  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});




app.get('/user/:id', async (req, res) => {
  try {
    const user = await ServiceProvider.findById(req.params.id) || 
                 await Customer.findById(req.params.id);
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.status(200).json({ 
      success: true, 
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

//Check if chat exists
app.get('/chats/existing', async (req, res) => {
  try {
    const { customerId, providerId } = req.query;
    
    if (!customerId || !providerId) {
      return res.status(400).json({
        success: false,
        message: "Both customerId and providerId are required"
      });
    }

    const chats = await Chat.find({
      $or: [
        { customerId, providerId },
        { customerId: providerId, providerId: customerId }
      ]
    });

    res.status(200).json({
      success: true,
      data: chats
    });
  } catch (error) {
    console.error('Error checking existing chats:', error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});


app.put('/messages/mark-seen', async (req, res) => {
  try {
    const { messageIds, userId } = req.body;
    
    if (!messageIds?.length || !Array.isArray(messageIds) || !userId) {
      return res.status(400).json({ success: false, message: "Invalid request" });
    }

    const messages = await Message.find({
      _id: { $in: messageIds },
      receiverId: userId
    });

    const { modifiedCount } = await Message.updateMany(
      { _id: { $in: messageIds }, receiverId: userId },
      { $set: { seen: true } }
    );

    if (modifiedCount > 0) {
      const io = req.app.get('io');
      if (io) {
        const chatUpdates = messages.reduce((acc, message) => {
          acc[message.chatId] = (acc[message.chatId] || 0) + 1;
          return acc;
        }, {});

        for (const [chatId, count] of Object.entries(chatUpdates)) {
          const chat = await Chat.findById(chatId);
          if (!chat) continue;

          const unreadCount = await Message.countDocuments({
            chatId,
            receiverId: userId,
            seen: false
          });

          // Emit to both participants
          io.to(`provider:${chat.providerId}`).emit('chatUpdate', {
            chatId,
            unreadCount,
            last_message: chat.last_message,
            updatedAt: new Date().toISOString()
          });
          
          io.to(`customer:${chat.customerId}`).emit('chatUpdate', {
            chatId,
            unreadCount,
            last_message: chat.last_message,
            updatedAt: new Date().toISOString()
          });
        }
      }
    }

    res.json({ success: true, modifiedCount });
  } catch (error) {
    console.error('Error marking messages as seen:', error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get('/chats/provider/:providerId', async (req, res) => {
  try {
    const { providerId } = req.params;
    
    const chats = await Chat.find({ 
      $or: [
        { providerId: providerId },
        { customerId: providerId }
      ]
    })
    .sort({ updatedAt: -1 })
    .lean();

    // Add unread count calculation
    const chatsWithUnread = await Promise.all(
      chats.map(async (chat) => {
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          receiverId: providerId, // Messages where provider is receiver
          seen: false
        });

        return { ...chat, unreadCount };
      })
    );

    res.status(200).json({ 
      success: true, 
      data: chatsWithUnread 
    });
  } catch (error) {
    console.error("Error fetching provider chats:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});

app.get('/provider/email/:email', async (req, res) => {
  try {
    const { email } = req.params;
    const provider = await ServiceProvider.findOne({ email });
    
    if (!provider) {
      return res.status(404).json({ 
        success: false, 
        message: "Provider not found" 
      });
    }

    res.status(200).json({
      success: true,
      data: provider
    });
  } catch (error) {
    console.error("Error fetching provider by email:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
});


app.get('/chats/customer/:customerId', async (req, res) => {
  try {
    const chats = await Chat.find({ customerId: req.params.customerId })
      .sort({ updatedAt: -1 })
      .lean();

    // Add unread count calculation
    const chatsWithUnread = await Promise.all(
      chats.map(async (chat) => {
        const unreadCount = await Message.countDocuments({
          chatId: chat._id,
          receiverId: req.params.customerId, // Messages where customer is receiver
          seen: false
        });

        return { ...chat, unreadCount };
      })
    );

    res.json({ success: true, data: chatsWithUnread });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});


const typingStatuses = new Map(); // { chatId: { userId, timestamp } }

// ======================
// Typing Indicator Endpoints
// ======================
io.on('connection', (socket) => {
  console.log('🔌 New connection:', socket.id);
  
  const { userType, userId } = socket.handshake.auth;
  const safeChatId = String(socket.handshake.query.chatId || '');
  const safeUserId = String(userId || '');
  const safeUserType = String(userType || '');

  // Join user-specific room
  if (safeUserType && safeUserId) {
    const room = `${safeUserType}:${safeUserId}`;
    socket.join(room);
    console.log(`🚪 ${safeUserType} ${safeUserId} joined their room`);
  }

  // Join chat room if present
  if (safeChatId) {
    socket.join(safeChatId);
    console.log(`💬 User joined chat ${safeChatId}`);
  }

  // Optional: additional joinChat event if client calls it again
  socket.on('joinChat', ({ chatId }) => {
    if (chatId) {
      socket.join(chatId);
      console.log(`📥 Manually joined chat: ${chatId}`);
    }
  });

  socket.on('typing', ({ chatId, isTyping }) => {
    console.log(`⌨️ Typing from ${userId} in chat ${chatId}:`, isTyping);
    socket.to(chatId).emit('typingStatus', {
      isTyping,
      senderId: userId,
    });
  });

  // Cleanup
  socket.on('disconnect', () => {
    console.log('🚪 Client disconnected:', socket.id);
  });
});



// ======================
// End of Chat Endpoints
// ======================




// ======================
// Start of Notifications Endpoints
// ======================


//Fetch Notifications
app.get('/notifications/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    const notifications = await Notification.find({ user: userId }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error('❌ Notification fetch error:', error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Mark all notifications as read for a user
app.put('/notifications/mark-read/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    await Notification.updateMany({ user: userId, read: false }, { $set: { read: true } });

    res.json({ success: true, message: "Notifications marked as read." });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


//=========
// PAYMENT
//=========

//Create Payment
app.post("/create-payment-intent", async (req, res) => {
  const { amount, customerId, providerId, requestId, savePaymentMethod = false } = req.body;

  const customer = await Customer.findById(customerId);
  if (!customer.stripeCustomerId) {
    return res.status(400).json({ success: false, message: "Stripe customer ID missing." });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "aed",
      customer: customer.stripeCustomerId,
      setup_future_usage: savePaymentMethod ? "off_session" : undefined,
      metadata: { customerId, providerId, requestId }
    });

    res.json({ success: true, clientSecret: paymentIntent.client_secret });
  } catch (error) {
    console.error("Payment intent error:", error);
    res.status(500).json({ success: false, message: "Payment Intent failed." });
  }
});


//Payment Success
app.post('/handle-payment-success', async (req, res) => {
  const { paymentIntentId, customerId, providerId, requestId, amount } = req.body;

  try {
    const chargeList = await stripe.charges.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });
    
    const charge = chargeList.data[0];
    const last4 = charge?.payment_method_details?.card?.last4;
    const brand = charge?.payment_method_details?.card?.brand; 
    const lastDigits = last4 || "9999"; //Last Digits
    const cardBrand = brand || "unknown";

    const request = await Request.findById(requestId);
    console.log("✅ Charge Retrieved:", JSON.stringify(charge, null, 2));


    const transaction = new Transaction({
      customerId,
      providerId,
      requestId,
      stripeSessionId: paymentIntentId,
      amount,
      service: request?.service || 'Service',
      lastDigits,
      cardBrand,
      status: 'completed',
    });

    await transaction.save();


    await Request.findByIdAndUpdate(requestId, {
      paid: true,
      state: 'done',
    });

    await Notification.create({
      user: customerId,
      type: 'payment',
      message: `Your payment of AED ${amount} for "${request?.service}" has been received.`,
      meta: { requestId, amount }
    });

    await Notification.create({
      user: providerId,
      type: 'payment',
      message: `Payment received for "${request?.service}" — AED ${amount}.`,
      meta: { requestId, amount }
    });

    res.json({ success: true });

    const customer = await Customer.findById(customerId);
    const provider = await ServiceProvider.findById(providerId);

    const paymentDate = new Date().toLocaleString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    if (customer?.email) {
      await sendEmail({
        to: customer.email,
        subject: `Payment received for ${request?.service || 'Service'} – ServiBid Receipt`,
        html: `
          <div style="max-width: 600px; margin: auto; padding: 20px; font-family: Arial, sans-serif; background: #fefefe; border-radius: 12px; border: 1px solid #eee;">
            <h2 style="color: #FE4D00; text-align: center;">🎉 Payment Successful</h2>
            <p style="font-size: 16px;">Hi ${customer.first_name || 'there'},</p>
            <p style="font-size: 15px;">Thank you for your payment! Your service request is now confirmed.</p>
            <div style="background: #fff; padding: 15px 20px; margin: 20px 15px 20px 0; border-radius: 10px; border: 1px solid #ddd;">
              <p><strong>🛎️ Service:</strong> ${request?.service || 'Service'}</p>
              <p><strong>💰 Amount:</strong> AED ${amount}</p>
              <p><strong>💳 Card:</strong> ${cardBrand.toUpperCase()} **** ${lastDigits}</p>
              <p><strong>📅 Date:</strong> ${paymentDate}</p>
            </div>
            <a href="https://servibid.tech/app/transactions" target="_blank"
              style="display: inline-block; margin-top: 20px; background: #FE4D00; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              📄 View Transaction
            </a>
            <p style="margin-top: 30px; font-size: 13px; color: #888; text-align: center;">
              Need help? Contact support@servibid.tech.<br/>
              Thank you for using ServiBid!
            </p>
          </div>
        `
      });
    }

    if (provider?.email) {
      await sendEmail({
        to: provider.email,
        subject: `You received a payment for ${request?.service || 'Service'} – ServiBid`,
        html: `
          <div style="max-width: 600px; margin: auto; padding: 20px; font-family: Arial, sans-serif; background: #fefefe; border-radius: 12px; border: 1px solid #eee;">
            <h2 style="color: #FE4D00; text-align: center;">💸 Payment Received!</h2>
            <p style="font-size: 16px;">Hi ${provider.name || 'there'},</p>
            <p style="font-size: 15px;">
              Good news! The customer has paid for the <strong>${request?.service || 'Service'}</strong> request. You can now contact them and schedule the job.
            </p>
            <div style="background: #fff; padding: 15px 20px; margin: 20px 15px 20px 0; border-radius: 10px; border: 1px solid #ddd;">
              <p><strong>🛎️ Service:</strong> ${request?.service || 'Service'}</p>
              <p><strong>💰 Amount:</strong> AED ${amount}</p>
              <p><strong>📅 Date:</strong> ${paymentDate}</p>
            </div>
            <a href="https://servibid.tech/app/services" target="_blank"
              style="display: inline-block; margin-top: 20px; background: #FE4D00; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              📋 View Job Details
            </a>
            <p style="margin-top: 30px; font-size: 13px; color: #888; text-align: center;">
              Thank you for your excellent service on ServiBid!
            </p>
          </div>
        `
      });
    }

    

  } catch (err) {
    console.error("Error handling payment success:", err);
    res.status(500).json({ success: false });
  }
});


//Ephermal key to retrieve last 4 digits
app.post("/create-ephemeral-key", async (req, res) => {
  const { stripeCustomerId } = req.body;

  try {
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: stripeCustomerId },
      { apiVersion: '2023-10-16' } // Use your Stripe API version here
    );

    res.json({ success: true, ephemeralKeySecret: ephemeralKey.secret });
  } catch (err) {
    console.error("Ephemeral key creation failed:", err);
    res.status(500).json({ success: false, message: "Ephemeral key failed" });
  }
});

// Get transactions for a customer
app.get('/transactions/:customerId', async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const transactions = await Transaction.find({ customerId }).sort({ createdAt: -1 });
    res.json({ success: true, transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ success: false, message: "Failed to fetch transactions" });
  }
});

//Get transaction using request ID
app.get("/transactions/request/:requestId", async (req, res) => {
  try {
    const requestId = req.params.requestId;
    const transaction = await Transaction.findOne({ requestId });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    res.json({ success: true, data: transaction });
  } catch (error) {
    console.error("Error fetching transaction by requestId:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


//Create stripe customer
app.post("/create-stripe-customer", async (req, res) => {
  const { email, name, customerId } = req.body;

  try {
    const stripeCustomer = await stripe.customers.create({
      email,
      name,
    });

    await Customer.findByIdAndUpdate(customerId, {
      stripeCustomerId: stripeCustomer.id,
    });

    res.json({ success: true, stripeCustomerId: stripeCustomer.id });
  } catch (error) {
    console.error("Stripe customer creation error:", error);
    res.status(500).json({ success: false, message: "Failed to create Stripe customer" });
  }
});




// Start server
server.listen(process.env.PORT || 3003, () => {
  console.log(`🚀 Server & Socket.io running on port ${process.env.PORT || 3003}`);
});

  } catch (error) {
    console.error('🔥 Critical startup failure:', error);
    process.exit(1);
  }
};

// Start the application
startServer();
