import express from 'express';
import dotenv from "dotenv";
import { connectDB } from './Config/db.js';
import Customer from "./models/customer.model.js"; // Import the model
import Services from './models/services.model.js'; // Import the Service model
import Request from './models/request.model.js'; // Import Requess model
import Bid from "./models/bid.model.js"; // Import bid model
import ServiceProvider from "./models/provider.model.js"; // Import the ServiceProvider model
import Review from './models/review.model.js'; //Import review  model
import Chat from "./models/chat.model.js"; //import chat model
import Message from "./models/message.model.js"; //import message model

dotenv.config();

const app = express();
app.use(express.json()); // Middleware to parse JSON request bodies

    
app.use(cors({
  origin: ['https://your-frontend-app.vercel.app', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));



// Connect to MongoDB before starting the server
const startServer = async () => {
  try {
    await connectDB();
    const port = process.env.PORT || 3000;
    
    // Define all routes AFTER database connection
    app.get("/", (req, res) => {
      res.status(200).json({ 
        status: "active",
        message: "Servibid Backend Running",
        timestamp: new Date().toISOString()
      });
    });



  // Start server only after DB connection is successful
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server started on port ${port}`);
});

}).catch(err => {
  console.error("Failed to connect to MongoDB:", err);
  process.exit(1); // Exit the process if DB connection fails
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
app.post("/request", async (req, res) => {
  const { customerID, service, date, time, description, budget, state } = req.body;

  if (!customerID || !service || !date || !time || !description || !budget) {
      return res.status(400).json({ success: false, message: "Please fill out all fields." });
  }

  try {
      const newRequest = new Request({
          customerID, // Ensure customerID is included
          service,
          date,
          time,
          description,
          budget,
          state,
      });

      await newRequest.save();
      res.status(201).json({ success: true, data: newRequest });
  } catch (error) {
      console.error('Error creating request:', error.message);
      res.status(500).json({ success: false, message: "Server error." });
  }
});

// Fetch requests by customer ID
app.get("/requests/:customerID", async (req, res) => {
  const { customerID } = req.params;

  try {
    const requests = await Request.find({ customerID });
    if (!requests.length) {
      return res.status(404).json({ success: false, message: "No requests found for this customer." });
    }
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

app.post("/requests-by-services", async (req, res) => {
  const { services } = req.body; // Expecting an array of service names

  if (!services || !Array.isArray(services) || services.length === 0) {
    return res.status(400).json({ success: false, message: "Invalid services list." });
  }

  try {
    const matchingRequests = await Request.find({ service: { $in: services } });

    if (!matchingRequests.length) {
      return res.status(404).json({ success: false, message: "No matching requests found." });
    }

    res.status(200).json({ success: true, data: matchingRequests });
  } catch (error) {
    console.error("Error fetching requests:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});

// Fetch requests by provider ID
app.get("/requests-by-provider/:providerId", async (req, res) => {
  const { providerId } = req.params;

  try {
    // Fetch requests that match the providerId
    const requests = await Request.find({ providerId });

    if (!requests.length) {
      return res.status(404).json({ success: false, message: "No active requests found for this provider." });
    }

    res.status(200).json({ success: true, data: requests });
  } catch (error) {
    console.error("Error fetching requests by provider:", error.message);
    res.status(500).json({ success: false, message: "Server error." });
  }
});




// server.js - Updated endpoints

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
      // Check if the request exists
      const request = await Request.findById(requestId);
      if (!request) {
          return res.status(404).json({ success: false, message: "Request not found." });
      }

      // Check if the provider exists
      const provider = await ServiceProvider.findById(providerId);
      if (!provider) {
          return res.status(404).json({ success: false, message: "Service provider not found." });
      }

      // Create and save the bid
      const newBid = new Bid({
          requestId,
          providerId,
          price,
          description,
          providerName: provider.name, // Assuming provider has a 'name' field
      });

      await newBid.save();

      res.status(201).json({ success: true, message: "Bid placed successfully!", data: newBid });

  } catch (error) {
      console.error("Error placing bid:", error.message);
      res.status(500).json({ success: false, message: "Server error." });
  }
});


app.put("/requests/:id", async (req, res) => {
  try {
    const { price, providerId, reviewId } = req.body;
    const updatedRequest = await Request.findByIdAndUpdate(
      req.params.id,
      { price, providerId },
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
    
    // Basic validation
    if (!rating || !title || !comment || !requestId || !providerId || !customerId) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    // Create and save the review
    const newReview = new Review({
      rating,
      title,
      comment,
      requestId,
      providerId,
      customerId
    });

    const savedReview = await newReview.save();

    // Update the corresponding request with the new review ID
    const updatedRequest = await Request.findByIdAndUpdate(
      requestId,
      { reviewId: savedReview._id },
      { new: true }
    );

    if (!updatedRequest) {
      // Rollback review creation if request not found
      await Review.findByIdAndDelete(savedReview._id);
      return res.status(404).json({ success: false, message: 'Associated request not found' });
    }

    res.status(201).json({ 
      success: true, 
      data: savedReview 
    });
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

// In server.js
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


// ADD THIS INSTEAD
app.get('/twilio-token', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKey = process.env.TWILIO_API_KEY_SID;
    const apiSecret = process.env.TWILIO_API_KEY_SECRET;

    const token = new Twilio.jwt.AccessToken(
      accountSid,
      apiKey,
      apiSecret,
      { identity: userId, ttl: 3600 }
    );

    const grant = new Twilio.jwt.AccessToken.ChatGrant({
      serviceSid: process.env.TWILIO_CHAT_SERVICE_SID
    });

    token.addGrant(grant);
    
    res.json({ token: token.toJwt() });
  } catch (error) {
    console.error('Twilio error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// Start server
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

// Start the application
startServer();
