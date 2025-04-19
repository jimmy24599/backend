// aiAssistant.js
import fs from 'fs';
import axios from 'axios';
import Customer from './models/customer.model.js';
import ServiceProvider from './models/provider.model.js';
import Request from './models/request.model.js';
import Bid from './models/bid.model.js';
import Review from './models/review.model.js';
import Services from './models/services.model.js';
import Message from './models/message.model.js';
import Chat from './models/chat.model.js';
import Transaction from './models/transaction.model.js';
import mongoose from 'mongoose';

const userIntentState = new Map();


//For Random responses
const randomResponse = (arr) => arr[Math.floor(Math.random() * arr.length)];



export const setupAIAssistant = (app) => {
  app.post("/ask-ai", async (req, res) => {
    const { message, email } = req.body;
    if (!message || !email) {
      return res.status(400).json({ success: false, message: "Message and email are required." });
    }

    try {
      const cleanEmail = email.toLowerCase().trim();
      const customer = await Customer.findOne({ email: cleanEmail });
      const provider = await ServiceProvider.findOne({ email: cleanEmail });
      if (!customer && !provider) {
        return res.status(404).json({ message: "No matching user found." });
      }

      const msg = message.toLowerCase().trim();
      const userState = userIntentState.get(email) || {};
      const customerId = customer?._id;
      const providerId = provider?._id;


// AI chatBot

const knowledgeBase = fs.readFileSync('./servibid_rag_chunks.jsonl', 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map(line => JSON.parse(line));

// Improved keyword overlap logic with fallback
function getRelevantChunks(query, topN = 3) {
  const keywords = query.toLowerCase().split(/\s+/);

  const scoredChunks = knowledgeBase
    .map(chunk => {
      const content = chunk.content.toLowerCase();
      const score = keywords.reduce(
        (count, word) => count + (content.includes(word) ? 1 : 0),
        0
      );
      return { content: chunk.content, score };
    })
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);

  return scoredChunks.length ? scoredChunks.map(chunk => chunk.content) : null;
}



    // =========================
    // 💬 CUSTOMER QUESTIONS
    // =========================
    if (customer) {
      const customerId = customer._id;

      // 1. Provider phone number
      if (msg.includes("provider") && msg.includes("phone")) {
        const req = await Request.findOne({ customerID: customerId, providerId: { $ne: null } }).sort({ date: -1 });
        if (!req) return res.json({ message: "No provider assigned yet." });
        const prov = await ServiceProvider.findById(req.providerId);
        return res.json({ message: `Your provider's phone number is ${prov.phone || "not available"}.` });
      }

      // 2. Provider name
      if (msg.includes("provider") && msg.includes("name")) {
        const req = await Request.findOne({ customerID: customerId, providerId: { $ne: null } }).sort({ date: -1 });
        if (!req) return res.json({ message: "No provider assigned yet." });
        const prov = await ServiceProvider.findById(req.providerId);
        return res.json({ message: `Your provider's name is ${prov.name || "not available"}.` });
      }

      // 3. List past requests
      if (msg.includes("past") && msg.includes("request")) {
        const requests = await Request.find({ customerID: customerId, date: { $lt: new Date() } });
        if (!requests.length) return res.json({ message: "No past requests found." });
        const services = requests.map(r => `• ${r.service} on ${new Date(r.date).toLocaleDateString()}`).join("\n");
        return res.json({ message: `Here are your past services:\n${services}` });
      }

      // 4. What services used
      if (msg.includes("services used") || msg.includes("what services")) {
        const distinct = await Request.distinct("service", { customerID: customerId });
        return res.json({ message: `You've used: ${distinct.join(", ")}` });
      }

      // 5. What category is my request under?
      if (msg.includes("category") && msg.includes("service")) {
        const latest = await Request.findOne({ customerID: customerId }).sort({ date: -1 });
        if (!latest) return res.json({ message: "No service found." });
        const info = await Services.findOne({ name: latest.service });
        return res.json({ message: `${latest.service} falls under the "${info?.category || "unknown"}" category.` });
      }

      // 6. Last service date
      if (msg.includes("last service")) {
        const latest = await Request.findOne({ customerID: customerId }).sort({ date: -1 });
        if (!latest) return res.json({ message: "No service history found." });
        return res.json({ message: `Your last service was ${latest.service} on ${new Date(latest.date).toLocaleDateString()}.` });
      }

      // 7. Next service
      if (msg.includes("next service") || msg.includes("service date")) {
        const upcoming = await Request.findOne({ customerID: customerId, date: { $gte: new Date() } }).sort({ date: 1 });
        if (!upcoming) return res.json({ message: "You have no upcoming services." });
        return res.json({ message: `Your next service is ${upcoming.service} on ${new Date(upcoming.date).toLocaleDateString()}.` });
      }

      // 8. Status of latest request
      if (msg.includes("status") && msg.includes("request")) {
        const latest = await Request.findOne({ customerID: customerId }).sort({ createdAt: -1 });
        if (!latest) return res.json({ message: "No request found." });
        return res.json({ message: `Your latest request is currently "${latest.state}".` });
      }

      // 9. Did I leave a review?
      if (msg.includes("review") && msg.includes("last")) {
        const latest = await Request.findOne({ customerID: customerId }).sort({ date: -1 });
        return res.json({ message: latest?.reviewId ? "You left a review." : "You haven't left a review yet." });
      }

      // 10. How much have I spent?
      if (msg.includes("how much") && msg.includes("spent")) {
        const paidReqs = await Request.find({ customerID: customerId, paid: true });
        const total = paidReqs.reduce((acc, r) => acc + (r.price || 0), 0);
        return res.json({ message: `You've spent a total of AED ${total.toFixed(2)}.` });
      }

      // 11. Was my last payment successful?
      if (msg.includes("last payment")) {
        const last = await Request.findOne({ customerID: customerId }).sort({ date: -1 });
        return res.json({ message: last?.paid ? "Yes ✅" : "Not yet ❌" });
      }

      // 12. Payment status
      if (msg.includes("payment status")) {
        const latest = await Request.findOne({ customerID: customerId }).sort({ date: -1 });
        return res.json({ message: latest?.paid ? "Paid ✅" : "Unpaid ❌" });
      }

      // 13. Provider rating
      if (msg.includes("provider") && msg.includes("rating")) {
        const req = await Request.findOne({ customerID: customerId, providerId: { $ne: null } }).sort({ date: -1 });
        const prov = await ServiceProvider.findById(req?.providerId);
        return res.json({ message: `Their rating is ${prov?.rating || "unavailable"}/5.` });
      }

      // 14. Providers worked with
      if (msg.includes("providers") && msg.includes("worked")) {
        const reqs = await Request.find({ customerID: customerId, providerId: { $ne: null } });
        const ids = [...new Set(reqs.map(r => r.providerId))];
        const names = await ServiceProvider.find({ _id: { $in: ids } }).then(list => list.map(p => p.name).join(", "));
        return res.json({ message: `You've worked with: ${names}` });
      }

      // 15. Unread messages
      if (msg.includes("unread messages")) {
        const count = await Message.countDocuments({ receiverId: customerId.toString(), seen: false });
        return res.json({ message: `You have ${count} unread message(s).` });
      }

      // 16. Who sent last message
      if (msg.includes("last message") && msg.includes("who")) {
        const msgDoc = await Message.find({ receiverId: customerId.toString() }).sort({ createdAt: -1 }).limit(1);
        const senderId = msgDoc[0]?.senderId;
        const person = await ServiceProvider.findById(senderId) || await Customer.findById(senderId);
        return res.json({ message: `Last message was from ${person?.name || "Unknown"}.` });
      }

      // 17. Highest bid
      if (msg.includes("highest bid")) {
        const latest = await Request.findOne({ customerID: customerId }).sort({ createdAt: -1 });
        const bids = await Bid.find({ requestId: latest?._id }).sort({ price: -1 });
        const prov = await ServiceProvider.findById(bids[0]?.providerId);
        return res.json({ message: `${prov?.name} placed highest bid of AED ${bids[0]?.price}.` });
      }

      // 18. Number of bids
      if (msg.includes("how many bids") || msg.includes("number of bids")) {
        const latest = await Request.findOne({ customerID: customerId }).sort({ createdAt: -1 });
        const count = await Bid.countDocuments({ requestId: latest?._id });
        return res.json({ message: `You have ${count} bid(s) on your latest request.` });
      }

      // 19. Paid for all requests?
      if (msg.includes("paid for all")) {
        const total = await Request.countDocuments({ customerID: customerId });
        const paid = await Request.countDocuments({ customerID: customerId, paid: true });
        return res.json({ message: paid === total ? "Yes, all are paid ✅" : `No, only ${paid}/${total} paid.` });
      }

      // 20. Services booked this month
      if (msg.includes("booked") && msg.includes("month")) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const count = await Request.countDocuments({ customerID: customerId, date: { $gte: start, $lte: end } });
        return res.json({ message: `You've booked ${count} service(s) this month.` });
      }

      // 21. Budget of latest request
      if (msg.includes("budget") && msg.includes("latest")) {
        const latest = await Request.findOne({ customerID: customerId }).sort({ createdAt: -1 });
        return res.json({ message: `Budget for your latest request is AED ${latest?.budget}` });
      }

      // 22. Highest budget request
      if (msg.includes("highest") && msg.includes("budget")) {
        const all = await Request.find({ customerID: customerId }).sort({ budget: -1 });
        return res.json({ message: `Your highest budget was AED ${all[0]?.budget} for ${all[0]?.service}.` });
      }

      // 23. Average spending
      if (msg.includes("average") && msg.includes("spend")) {
        const reqs = await Request.find({ customerID: customerId, paid: true });
        const total = reqs.reduce((sum, r) => sum + (r.price || 0), 0);
        const avg = reqs.length ? total / reqs.length : 0;
        return res.json({ message: `You spend AED ${avg.toFixed(2)} on average.` });
      }

      // 24. Services not reviewed
      if (msg.includes("not reviewed") || msg.includes("haven't reviewed")) {
        const reqs = await Request.find({ customerID: customerId });
        const notReviewed = reqs.filter(r => !r.reviewId);
        const services = [...new Set(notReviewed.map(r => r.service))].join(", ");
        return res.json({ message: `Services not reviewed yet: ${services}` });
      }

      // 25. Most frequent service
      if (msg.includes("most frequent") || msg.includes("most used")) {
        const reqs = await Request.find({ customerID: customerId });
        const freqMap = {};
        reqs.forEach(r => freqMap[r.service] = (freqMap[r.service] || 0) + 1);
        const most = Object.entries(freqMap).sort((a, b) => b[1] - a[1])[0];
        return res.json({ message: `Most frequent service: ${most[0]} (${most[1]} times)` });
      }

      // 26. Accepted bids
      if (msg.includes("accepted bids")) {
        const count = await Request.countDocuments({ customerID: customerId, providerId: { $ne: null } });
        return res.json({ message: `You accepted ${count} bid(s).` });
      }

      // 27. Total bids placed
      if (msg.includes("bids i placed") || msg.includes("total bids i sent")) {
        const bids = await Bid.find({ customerId: customerId });
        return res.json({ message: `You placed ${bids.length} bid(s).` });
      }

      // 28. Bids accepted
      if (msg.includes("my bids") && msg.includes("accepted")) {
        const accepted = await Request.countDocuments({ providerId: customerId });
        return res.json({ message: `You had ${accepted} accepted bid(s).` });
      }
    }


    // =========================
    // 👨‍🔧 PROVIDER QUESTIONS
    // =========================
    if (provider) {
      const providerId = provider._id;

      // 1. Completed jobs
      if (msg.includes("how many") && msg.includes("jobs")) {
        const done = await Request.countDocuments({ providerId, state: "done" });
        return res.json({
          message: randomResponse([
            `🎉 Nice! You've completed ${done} job${done !== 1 ? 's' : ''} so far.`,
            `💼 That's ${done} job${done !== 1 ? 's' : ''} in the bag. Keep it up!`,
            `👏 Impressive — ${done} completed and counting!`
          ])
        });
        
      }

      // 2. Total revenue
      if (msg.includes("total revenue")) {
        const jobs = await Request.find({ providerId, paid: true });
        const total = jobs.reduce((acc, job) => acc + (job.price || 0), 0);
        return res.json({
          message: randomResponse([
            `💰 You've earned a total of AED ${total.toFixed(2)} — great job!`,
            `🔥 AED ${total.toFixed(2)} in revenue! Keep the momentum going.`,
            `💸 That's AED ${total.toFixed(2)} you've made. Hustle pays off!`
          ])
        });
      }

      // 3. Average rating
      if (msg.includes("average rating")) {
        return res.json({ message: `Your average rating is ${provider.rating}/5.` });
      }

      // 4. Next assigned job
      if (msg.includes("next job") || msg.includes("assigned job")) {
        const next = await Request.findOne({ providerId, date: { $gte: new Date() } }).sort({ date: 1 });
        if (!next) return res.json({ message: "You have no upcoming jobs." });
        return res.json({ message: `Your next job is ${next.service} on ${new Date(next.date).toLocaleDateString()}.` });
      }

      // 5. Most requested service
      if (msg.includes("most requested") || msg.includes("most frequent service")) {
        const all = await Request.find({ providerId });
        const freq = {};
        all.forEach(r => freq[r.service] = (freq[r.service] || 0) + 1);
        const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
        return res.json({ message: `Your most requested service is ${top[0]} (${top[1]} times).` });
      }

      // 6. Earnings this month
      if (msg.includes("earned this month") || msg.includes("revenue this month")) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const reqs = await Request.find({ providerId, paid: true, date: { $gte: start, $lte: end } });
        const total = reqs.reduce((sum, r) => sum + (r.price || 0), 0);
        return res.json({ message: `You earned AED ${total.toFixed(2)} this month.` });
      }

      // 7. Highest earning request
      if (msg.includes("highest earning")) {
        const reqs = await Request.find({ providerId }).sort({ price: -1 });
        if (!reqs.length) return res.json({ message: "No requests found." });
        return res.json({ message: `Your highest earning was ${reqs[0].service} at AED ${reqs[0].price}` });
      }

      // 8. Most frequent customer
      if (msg.includes("most frequent customer")) {
        const reqs = await Request.find({ providerId });
        const counts = {};
        reqs.forEach(r => counts[r.customerID] = (counts[r.customerID] || 0) + 1);
        const topId = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
        const customer = await Customer.findById(topId);
        return res.json({ message: `Most frequent customer is ${customer?.first_name || "Unknown"} (${counts[topId]} times).` });
      }

      // 9. Upcoming jobs this week
      if (msg.includes("jobs") && msg.includes("this week")) {
        const now = new Date();
        const end = new Date();
        end.setDate(now.getDate() + 7);
        const jobs = await Request.find({ providerId, date: { $gte: now, $lte: end } });
        if (!jobs.length) return res.json({ message: "No jobs this week." });
        const list = jobs.map(j => `• ${j.service} on ${new Date(j.date).toLocaleDateString()}`).join("\n");
        return res.json({ message: `Jobs this week:\n${list}` });
      }

      // 10. New reviews this month
      if (msg.includes("reviews") && msg.includes("this month")) {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const count = await Review.countDocuments({ providerId, createdAt: { $gte: start, $lte: end } });
        return res.json({ message: `You've received ${count} review(s) this month.` });
      }

      // 11. Total messages sent
      if (msg.includes("messages sent")) {
        const count = await Message.countDocuments({ senderId: providerId.toString() });
        return res.json({ message: `You've sent ${count} message(s).` });
      }

      // 12. Last file shared
      if (msg.includes("last file") || msg.includes("last shared")) {
        const file = await Message.findOne({ senderId: providerId.toString(), type: { $ne: "text" } }).sort({ createdAt: -1 });
        return res.json({ message: file ? `Last shared: ${file.fileName || "unnamed file"}` : "You haven't shared any files yet." });
      }
    }



// AI ACTION FUNCTIONS (CREATE / UPDATE / CANCEL / NOTIFY)


const classifyIntent = async (message) => {
  const prompt = `
Classify the intent of the user's message below into one of the following categories:

- create_request
- view_requests
- ask_provider_info
- update_name
- send_message
- cancel_request
- complete_payment
- submit_bid
- mark_done
- ask_general_question

User Message: "${message}"

Reply ONLY with one of the category keywords above. Do not explain.
`;

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
      }
    }
  );

  return response.data.choices?.[0]?.message?.content.trim();
};

//Extract Category 

const extractCategory = async (message, categories) => {
  const prompt = `
Extract the most relevant service category from the message below. 
Only choose from the following categories:

${categories.map(cat => `- ${cat}`).join("\n")}

If the category is unclear or not mentioned, reply with "none".

Message: "${message}"

Respond ONLY with a category name from the list or "none".
`;

  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
      }
    }
  );

  return res.data.choices?.[0]?.message?.content.trim();
};


// 1. Create a new service request (customer)

// STEP 1: Start request
const intent = await classifyIntent(msg);
const isCreateIntent =
  intent === "create_request" ||
  msg.includes("create request") ||
  msg.includes("new request") ||
  msg.includes("book a service");
  if (isCreateIntent) {
    const allServices = await Services.find({});
    const categories = [...new Set(allServices.map(s => s.category))];
    const matchedCategory = await extractCategory(message, categories);
  
    if (matchedCategory && matchedCategory !== "none") {
      userIntentState.set(email, { step: "awaiting_service", selectedCategory: matchedCategory });
  
      if (matchedCategory.toLowerCase().includes("auto")) {
        userIntentState.set(email, { step: "awaiting_car_type", selectedCategory: matchedCategory });
  
        const carTypes = ["Sedan", "SUV", "Hatchback", "Coupe", "Convertible", "Pickup", "Van"];
        return res.json({
          message:
            `🚗 Sweet wheels! What kind of ride do you have?\n\n` +
            carTypes.map(c => `👉 ${c}`).join("   ")
        });
      }
  
      if (matchedCategory.toLowerCase().includes("plumbing")) {
        return res.json({
          message:
            `🚿 Got plumbing issues? Choose from below:\n\n` +
            `🛁 Bathroom:\n🔧 Toilet Repair   🚿 Shower Install   🚰 Faucet Replace   🚽 Bidet Spray\n\n` +
            `🍽️ Kitchen:\n🧼 Sink Fix   🌀 Washing Machine   💧 Water Filter\n\n` +
            `🛠️ General:\n💦 Leak Fix   🔄 Drain Clean   🔧 Pipe Work   🔋 Water Pump   🔥 Heater Repair`
        });
      }
  
      if (matchedCategory.toLowerCase().includes("home cleaning")) {
        return res.json({
          message:
            `🧹 Sure! Pick your preferred cleaning style:\n\n` +
            "✨ Regular   🧼 Deep   📦 Move-in/Out   🛠️ Post-renovation"
        });
      }
  
      if (matchedCategory.toLowerCase().includes("painting")) {
        return res.json({
          message:
            `🎨 What area needs painting?\n\n` +
            `🖼️ Interior   ⬆️ Ceilings   🧱 Exterior   🚪 Doors   ✨ Touch-ups   🏚️ Full Renovation`
        });
      }
  
      if (matchedCategory.toLowerCase().includes("laundry")) {
        return res.json({
          message:
            `🧺 Laundry time! Choose what you need:\n\n` +
            `🧼 Cleaning   🔥 Ironing   🧴 Dry Cleaning`
        });
      }
  
      if (!matchedCategory || matchedCategory === "none") {
        return res.json({
          message: "Sorry, I couldn't detect the category. Please choose one:\n\n" +
            categories.map(cat => `• ${cat}`).join("\n")
        });
      }
      // fallback to default subservice picker
      const servicesInCategory = allServices.filter(s => s.category === matchedCategory);
      return res.json({
        message: `Perfect! Please select a service under "${matchedCategory}":\n\n` +
          servicesInCategory.map(s => `• ${s.name}`).join("\n")
      });
    }
  
    // No category detected — fallback to manual step
    userIntentState.set(email, { step: "awaiting_category" });
  
    return res.json({
      message: `Great! Let's get started. Please choose a category:\n\n` +
        categories.map(cat => `• ${cat}`).join("\n")
    });
  }
// STEP 2: Category selection
if (userState?.step === "awaiting_category") {
  const allServices = await Services.find({});
  const categories = [...new Set(allServices.map(s => s.category))];

  const matchedCategory = await extractCategory(message, categories);

  if (!matchedCategory || matchedCategory === "none") {
    return res.json({
      message: "Sorry, I couldn't detect the category. Please choose one:\n\n" +
        categories.map(cat => `• ${cat}`).join("\n")
    });
  }

  if (matchedCategory.toLowerCase().includes("auto")) {
    userIntentState.set(email, { step: "awaiting_car_type", selectedCategory: matchedCategory });

    const carTypes = ["Sedan", "SUV", "Hatchback", "Coupe", "Convertible", "Pickup", "Van"];
    return res.json({
      message: "What type of car do you have?\n\n" + carTypes.map(c => `• ${c}`).join("\n")
    });
  }

  if (matchedCategory.toLowerCase().includes("plumbing")) {
    userIntentState.set(email, { step: "awaiting_service", selectedCategory: matchedCategory });
    return res.json({
      message: "What type of plumbing service do you need?\n\n" +
        "🚽 Bathroom Plumbing:\n• Toilet Repair\n• Shower Installation\n• Faucet Replacement\n• Bidet Spray Installation\n\n" +
        "🍽️ Kitchen Plumbing:\n• Kitchen Sink Plumbing\n• Washing Machine Plumbing\n• Water Filter Installation\n\n" +
        "🛠️ General Plumbing:\n• Leak Detection & Repair\n• Drain Cleaning\n• Pipe Rerouting\n• Water Pump Repair\n• Water Heater Repair"
    });
  }

  if (matchedCategory.toLowerCase().includes("home cleaning")) {
    userIntentState.set(email, { step: "awaiting_service", selectedCategory: matchedCategory });
    return res.json({
      message: "What type of cleaning do you need?\n\n• Regular Cleaning\n• Deep Cleaning\n• Move-in/Move-out\n• Post-renovation"
    });
  }

  if (matchedCategory.toLowerCase().includes("painting")) {
    userIntentState.set(email, { step: "awaiting_service", selectedCategory: matchedCategory });
    return res.json({
      message: "Where do you want painting?\n\n• Interior Walls\n• Ceilings\n• Exterior Walls\n• Doors & Frames\n• Touch-up Painting\n• Full Renovation Painting"
    });
  }

  if (matchedCategory.toLowerCase().includes("laundry")) {
    userIntentState.set(email, { step: "awaiting_service", selectedCategory: matchedCategory });
    return res.json({
      message: "What laundry service do you need?\n\n• Cleaning\n• Ironing\n• Dry Cleaning"
    });
  }

  // Default fallback
  const servicesInCategory = allServices.filter(s => s.category === matchedCategory);
  userIntentState.set(email, { step: "awaiting_service", selectedCategory: matchedCategory });

  return res.json({
    message: `Perfect! Please select a service under "${matchedCategory}":\n\n` +
      servicesInCategory.map(s => `• ${s.name}`).join("\n")
  });
}

// STEP 3-A: Car Type
if (userState?.step === "awaiting_car_type") {
  const carTypes = ["Sedan", "SUV", "Hatchback", "Coupe", "Convertible", "Pickup", "Van"];

  const prompt = `
A user is describing their car. Extract the most likely car type based on what they say.

Choose only from this list:
${carTypes.map(c => `- ${c}`).join("\n")}

If the car type isn't obvious or cannot be confidently matched, return "none".

User said: "${message}"

Respond ONLY with the car type or "none".
`;

  const aiResponse = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
      }
    }
  );

  const carTypeRaw = aiResponse.data.choices?.[0]?.message?.content?.trim();
  const extractedCarType = carTypes.find(ct => ct.toLowerCase() === carTypeRaw?.toLowerCase());

  if (!extractedCarType) {
    return res.json({
      message: "Hmm, I didn’t quite get your car type. Can you rephrase or choose one of these?\n\n" +
        carTypes.map(c => `• ${c}`).join("\n")
    });
  }

  userIntentState.set(email, {
    ...userState,
    step: "awaiting_service",
    selectedCarType: extractedCarType
  });

  return res.json({
    message: `Got it! A ${extractedCarType}. Now, what service do you need?\n\n` +
      "🔧 Engine & Maintenance:\n• Brake Repair & Replacement\n• Engine Diagnostics & Repair\n• Transmission Repair\n• Oil Change Service\n\n" +
      "🧼 Exterior & Interior:\n• Car Wash & Detailing\n• Car Painting & Scratch Removal\n• Windshield Repair & Replacement\n\n" +
      "⚡ Electrical & Cooling:\n• Car AC Repair & Refill\n• Wiring Check\n• Battery Replacement\n• Light Replacement"
  });
}

// STEP 3-B: Service Selection (using GPT to match)
if (userState?.step === "awaiting_service") {
  const selectedCategory = userState.selectedCategory;
  const servicesInCategory = await Services.find({ category: selectedCategory });
  const serviceNames = servicesInCategory.map(s => s.name);

  const prompt = `
You're helping a user book a service in the "${selectedCategory}" category.
Your job is to identify the best matching service name from the list below, based on what they said.

Service Options:
${serviceNames.map(s => `- ${s}`).join("\n")}

User said: "${message}"

Reply ONLY with one exact match from the list above, or "none" if nothing matches well.
`;

  const gptRes = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }]
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
      }
    }
  );

  const selectedServiceRaw = gptRes.data.choices?.[0]?.message?.content?.trim();
  const matchedService = servicesInCategory.find(
    s => s.name.toLowerCase() === selectedServiceRaw?.toLowerCase()
  );

  if (!matchedService) {
    return res.json({
      message: `Hmm, I couldn’t find a match in "${selectedCategory}". Can you pick one of these?\n\n` +
        servicesInCategory.map(s => `• ${s.name}`).join("\n")
    });
  }

  userIntentState.set(email, {
    ...userState,
    step: "awaiting_date",
    selectedService: matchedService.name
  });

  return res.json({
    message: `Awesome! When would you like the "${matchedService.name}" service? (e.g., April 20 or 2025-04-20)`
  });
}

// STEP 4: Date (with natural language support)
if (userState?.step === "awaiting_date") {
  const today = new Date();

  // First, try direct parsing
  let parsedDate = new Date(message.trim());

  // If it's not valid or unclear, use GPT to extract
  if (isNaN(parsedDate.getTime()) || parsedDate < today) {
    const prompt = `
You're helping a user schedule a service. Today's date is ${today.toDateString()}.

They said: "${message}"

Extract a valid future date in YYYY-MM-DD format from their message.
If the date is unclear or invalid, reply with "none".

Only reply with the date string or "none".
`;

    const aiRes = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
        }
      }
    );

    const extractedDateStr = aiRes.data.choices?.[0]?.message?.content?.trim();

    if (!extractedDateStr || extractedDateStr.toLowerCase() === "none") {
      return res.json({
        message: "I couldn’t understand the date. Please enter a valid future date (e.g., 2025-04-20 or 'next Friday')."
      });
    }

    parsedDate = new Date(extractedDateStr);
  }

  if (isNaN(parsedDate.getTime()) || parsedDate < today) {
    return res.json({ message: "Please enter a valid future date (e.g., 2025-04-20)." });
  }

  userIntentState.set(email, {
    ...userState,
    step: "awaiting_budget",
    selectedDate: parsedDate
  });

  return res.json({ message: "Got it! What's your budget for this service? (in AED)" });
}
// STEP 5: Budget (with natural language understanding)
if (userState?.step === "awaiting_budget") {
  let budget = parseFloat(message.trim());

  // If input isn't a clean number, use GPT to extract a budget value
  if (isNaN(budget) || budget <= 0) {
    const prompt = `
You're helping a user provide their budget for a service.

They said: "${message}"

Extract the most reasonable **single number** in AED that represents their intended budget.
Only reply with the number (e.g., 250). If unclear, reply with "none".
`;

    const aiRes = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [{ role: "user", content: prompt }]
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
        }
      }
    );

    const extracted = aiRes.data.choices?.[0]?.message?.content?.trim();

    budget = parseFloat(extracted);
  }

  if (isNaN(budget) || budget <= 0) {
    return res.json({ message: "I couldn’t understand your budget. Please enter a valid amount in AED (e.g., 150)." });
  }

  userIntentState.set(email, {
    ...userState,
    step: "awaiting_description",
    selectedBudget: budget
  });

  return res.json({ message: "Almost done! Please add a short note or description for the provider." });
}

// STEP 6: Description
if (userState?.step === "awaiting_description") {
  userIntentState.set(email, {
    ...userState,
    step: "awaiting_location",
    description: message.trim()
  });

  return res.json({
    message: `📍 Almost there! Please share your location coordinates so the provider can reach you.\n\nFormat:\nlatitude, longitude\n\nExample: 24.4539, 54.3773`
  });
}



// STEP 7: Location
if (userState?.step === "awaiting_location") {
  const [latStr, lngStr] = message.trim().split(',').map(s => s.trim());
  const latitude = parseFloat(latStr);
  const longitude = parseFloat(lngStr);

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.json({ message: "❌ Invalid format. Please enter your location as:\n24.4539, 54.3773" });
  }

  let details = {};
  const category = userState.selectedCategory;
  const lowerCat = category.toLowerCase();

  if (lowerCat.includes("auto")) {
    details = {
      carType: userState.selectedCarType || "Sedan",
      serviceType: userState.selectedService
    };
  } else if (lowerCat.includes("home cleaning")) {
    details = {
      homeType: "Apartment",
      bedroomCount: 2,
      bathroomCount: 1,
      cleaningType: userState.selectedService
    };
  } else if (lowerCat.includes("plumbing")) {
    details = {
      homeType: "Apartment",
      plumbingType: userState.selectedService
    };
  } else if (lowerCat.includes("painting")) {
    details = {
      homeType: "Apartment",
      bedroomCount: 2,
      paintingArea: userState.selectedService
    };
  } else if (lowerCat.includes("laundry")) {
    details = {
      laundryType: userState.selectedService,
      preferences: ["Folding", "Pickup/Drop-off"],
      items: {
        shirts: 2,
        pants: 2,
        bedsheets: 1,
        pillowCovers: 2
      }
    };
  }

  const newRequest = await Request.create({
    customerID: customerId,
    service: category,
    category,
    description: userState.description,
    budget: userState.selectedBudget,
    date: userState.selectedDate,
    location: { latitude, longitude },
    state: "in-progress",
    details
  });

  userIntentState.delete(email);

  return res.json({
    message: `✅ Your request for "${newRequest.service}" on ${newRequest.date.toLocaleDateString()} has been created with location: ${latitude}, ${longitude}.`
  });
}








// 2. Submit a bid on a request (provider)
// Provider wants to place a bid
// Step: Detect bid intent naturally using GPT

if (intent === "submit_bid") {
  const latestRequest = await Request.findOne({ state: "in-progress", providerId: null }).sort({ createdAt: -1 });

  if (!latestRequest) {
    return res.json({ message: "🚫 No service requests are currently open for bidding. Please check again later." });
  }

  // Save state for upcoming bid amount
  userIntentState.set(email, {
    step: "awaiting_bid_amount",
    targetRequestId: latestRequest._id
  });

  return res.json({
    message:
      `📝 Request Details:\n` +
      `• Service: ${latestRequest.service}\n` +
      `• Date: ${latestRequest.date.toLocaleDateString()}\n` +
      `• Customer Budget: AED ${latestRequest.budget}\n` +
      `• Note: ${latestRequest.description || "No note provided."}\n\n` +
      `💰 Please enter the amount you'd like to bid (in AED).`
  });
}

// Step: Provider submits bid amount
if (userState?.step === "awaiting_bid_amount") {
  const amount = parseFloat(message.trim());

  if (isNaN(amount) || amount <= 0) {
    return res.json({ message: "❌ Please enter a valid bid amount in AED." });
  }

  const requestId = userState.targetRequestId;
  const request = await Request.findById(requestId);
  if (!request) {
    userIntentState.delete(email);
    return res.json({ message: "🚫 That request is no longer available." });
  }

  await Bid.create({
    providerId: provider._id,
    requestId: request._id,
    price: amount,
    description: "Bid placed via AI assistant"
  });

  userIntentState.delete(email);

  return res.json({
    message: randomResponse([
      `📨 Your AED ${amount} bid on "${request.service}" (for ${request.date.toLocaleDateString()}) is in! Let's hope they pick you 🔧`,
      `🚀 Bid placed: AED ${amount} for ${request.service}. Fingers crossed!`,
      `✅ Nice! You've submitted a bid of AED ${amount}. We'll let you know if it's accepted.`
    ])
  });
}


// 3. Mark a request as done (provider)
if (
  msg.includes("mark done") ||
  msg.includes("complete the job") ||
  msg.includes("job is finished") ||
  msg.includes("finished the service")
) {
  const req = await Request.findOne({ providerId: providerId, state: { $ne: "done" } }).sort({ date: -1 });
  if (!req) return res.json({ message: "No in-progress jobs to mark as done." });
  req.state = "done";
  await req.save();
  return res.json({ message: `Marked request for ${req.service} as done ✅.` });
}

// 4. Mark all messages as seen
if (
  msg.toLowerCase().includes("mark message seen") ||
  msg.toLowerCase().includes("mark messages as seen") ||
  msg.toLowerCase().includes("mark all message seen") ||
  msg.toLowerCase().includes("mark all messages as seen") ||
  msg.toLowerCase().includes("mark messages seen") ||
  msg.toLowerCase().includes("read my messages") ||
  msg.toLowerCase().includes("seen all messages") ||
  msg.toLowerCase().includes("clear unread messages") ||
  msg.toLowerCase().includes("mark as read") ||
  msg.toLowerCase().includes("mark seen")
) {
  const customer = await Customer.findOne({ email });
  const provider = await ServiceProvider.findOne({ email });

  const user = customer || provider;

  if (!user) {
    return res.json({ message: "❌ Could not identify your account. Please make sure you're logged in." });
  }

  const receiverId = new mongoose.Types.ObjectId(user._id);

  // Optional log: check if any unseen messages exist first
  const unseenMessages = await Message.find({ receiverId, seen: false });
  console.log(`Found unseen: ${unseenMessages.length}`);

  if (unseenMessages.length === 0) {
    return res.json({ message: "✅ All your messages are already marked as seen." });
  }

  const result = await Message.updateMany(
    { receiverId, seen: false },
    { $set: { seen: true } }
  );

  return res.json({
    message: `✅ Marked ${result.modifiedCount} message${result.modifiedCount !== 1 ? "s" : ""} as seen.`
  });
}




// 5. Complete payment (simulate)
if (
  msg.includes("complete payment") ||
  msg.includes("mark payment done") ||
  msg.includes("finish payment") ||
  msg.includes("confirm payment")
) {
  const txn = await Transaction.findOne({ customerId: customerId }).sort({ createdAt: -1 });
  if (!txn) return res.json({ message: "No transaction found." });
  txn.status = "complete";
  await txn.save();
  await Request.findByIdAndUpdate(txn.requestId, { paid: true });
  return res.json({
    message: randomResponse([
      `✅ Payment of AED ${txn.amount} confirmed. Thanks for using ServiBid!`,
      `💳 Got it! AED ${txn.amount} payment marked as done.`,
      `🎉 Payment completed — AED ${txn.amount} is all set!`
    ])
  });}

// 6. Cancel request
if (
  msg.includes("cancel request") ||
  msg.includes("delete my request") ||
  msg.includes("remove latest request") ||
  msg.includes("cancel the job")
) {
  const latest = await Request.findOne({ customerID: customerId }).sort({ createdAt: -1 });
  if (!latest) return res.json({ message: "No request to cancel." });
  await Request.findByIdAndDelete(latest._id);
  return res.json({ message: `Canceled your latest request for ${latest.service}.` });
}

// 7. Delete a review
if (
  msg.includes("delete review") ||
  msg.includes("remove my review") ||
  msg.includes("undo review") ||
  msg.includes("erase review")
) {
  const latest = await Request.findOne({ customerID: customerId, reviewId: { $ne: null } }).sort({ createdAt: -1 });
  if (!latest || !latest.reviewId) return res.json({ message: "No review to delete." });
  await Review.findByIdAndDelete(latest.reviewId);
  latest.reviewId = null;
  await latest.save();
  return res.json({ message: "Deleted your latest review." });
}

// 8. Send message to provider
if (
  msg.includes("send message to provider") ||
  msg.includes("message my provider") ||
  msg.includes("chat with provider") ||
  msg.includes("send message") ||
  msg.includes("talk to provider")
) {
  const state = userIntentState.get(email);

  // Step 1: Ask user to choose from available providers
  if (!state || state.step !== "awaiting_provider_choice") {
    const requests = await Request.find({ customerID: customerId, providerId: { $ne: null } }).sort({ date: -1 });
    const uniqueProviderIds = [...new Set(requests.map(r => r.providerId.toString()))];
    const providers = await ServiceProvider.find({ _id: { $in: uniqueProviderIds } });

    if (!providers.length) return res.json({ message: "You have no assigned providers to message." });

    userIntentState.set(email, {
      step: "awaiting_provider_choice",
      providers: providers.map(p => ({
        id: p._id.toString(),
        name: p.name
      }))
    });

    return res.json({
      message: `Who would you like to message?\n\n${providers.map(p => `• ${p.name}`).join("\n")}`
    });
  }

  // Step 2: Match input to a provider
  if (state.step === "awaiting_provider_choice") {
    const input = message.trim().toLowerCase();
    const match = state.providers.find(p => p.name.toLowerCase().includes(input));
    if (!match) {
      return res.json({
        message: `Couldn't find that provider. Please choose from:\n\n${state.providers.map(p => `• ${p.name}`).join("\n")}`
      });
    }

    const chat = await Chat.findOneAndUpdate(
      { customerId: customerId, providerId: match.id },
      { last_message: "Hello from AI 👋", updatedAt: new Date() },
      { upsert: true, new: true }
    );

    await Message.create({
      senderId: customerId.toString(),
      receiverId: match.id,
      chatId: chat._id,
      text: "Hello from AI 👋",
      seen: false,
    });

    userIntentState.delete(email);

    return res.json({ message: `Message sent to ${match.name} ✅.` });
  }
}


// 8. Send message to customer (for providers)
if (
  msg.includes("send message to customer") ||
  msg.includes("message my customer") ||
  msg.includes("chat with customer") ||
  msg.includes("talk to customer")
) {
  const relatedRequests = await Request.find({ providerId: providerId }).populate("customerID");

  if (!relatedRequests.length) {
    return res.json({ message: "❌ No customers found to message." });
  }

  // Save intent and prompt for customer name or service
  userIntentState.set(email, { step: "awaiting_customer_selection", customers: relatedRequests });

const customerOptions = relatedRequests.map((r) => {
  const customer = r.customerID;
  const name =
    customer?.first_name?.trim() ||
    customer?.firstName?.trim() ||
    customer?.email?.split('@')[0] ||
    "Customer";
  return `• ${name} - ${r.service}`;
}).join("\n");


  return res.json({ message: `📨 Please choose a customer to message:\n\n${customerOptions}` });
}

// Step 2: Handle customer selection and send message
if (userState?.step === "awaiting_customer_selection") {
  const selected = message.trim().toLowerCase();

  const match = userState.customers.find(r => {
    const name = r.customerID.first_name || r.customerID.firstName || "";
    return name.toLowerCase().includes(selected) || r.service.toLowerCase().includes(selected);
  });

  if (!match) {
    const customerOptions = userState.customers.map((r) => {
      const customer = r.customerID;
      const name =
      customer?.first_name?.trim() ||
      customer?.firstName?.trim() ||
      customer?.email?.split('@')[0] || // use email prefix if name missing
      "Customer";
    
      return `• ${name} - ${r.service}`;
    }).join("\n");

    return res.json({
      message: `❌ Couldn't match that input. Please reply with a valid customer name or service:\n\n${customerOptions}`
    });
  }

  const chat = await Chat.findOneAndUpdate(
    { customerId: match.customerID._id, providerId: providerId },
    { last_message: "Hello from AI 👋", updatedAt: new Date() },
    { upsert: true, new: true }
  );

  await Message.create({
    senderId: providerId.toString(),
    receiverId: match.customerID._id.toString(),
    chatId: chat._id,
    text: "Hello from AI 👋",
    seen: false,
  });

  userIntentState.delete(email);

  const name = match.customerID.first_name || match.customerID.firstName || "Customer";

  return res.json({ message: `✅ Message sent to ${name} successfully.` });
}






// 9. Update user info (name)
if (customer) {
  if (msg.includes("change my name") || msg.includes("update my name") || msg.includes("edit my name")) {
    userIntentState.set(email, { action: "awaiting_full_name" });
    return res.json({ message: "Sure! What’s your new first and last name?" });
  }
  if (msg.includes("change my first name") || msg.includes("update first name") || msg.includes("edit my first name")) {
    userIntentState.set(email, { action: "awaiting_first_name" });
    return res.json({ message: "What would you like your first name to be?" });
  }
  if (msg.includes("change my last name") || msg.includes("update last name")|| msg.includes("edit my last name")) {
    userIntentState.set(email, { action: "awaiting_last_name" });
    return res.json({ message: "Alright, what’s your new last name?" });
  }
  if (msg.includes("change my location") || msg.includes("update my location") || msg.includes("edit my location")) {
    userIntentState.set(email, { action: "awaiting_location" });
    return res.json({ message: "Where should I update your location to?" });
  }

  if (userState.action === "awaiting_first_name") {
    customer.first_name = message.trim();
    await customer.save();
    userIntentState.delete(email);
    return res.json({ message: `First name updated to ${customer.first_name}` });
  }

  if (userState.action === "awaiting_last_name") {
    customer.last_name = message.trim();
    await customer.save();
    userIntentState.delete(email);
    return res.json({ message: `Last name updated to ${customer.last_name}` });
  }

  if (userState.action === "awaiting_location") {
    customer.location = message.trim();
    await customer.save();
    userIntentState.delete(email);
    return res.json({ message: `Location updated to ${customer.location}` });
  }

  if (userState.action === "awaiting_full_name") {
    const parts = message.trim().split(" ");
    customer.first_name = parts[0] || customer.first_name;
    customer.last_name = parts.slice(1).join(" ") || customer.last_name;
    await customer.save();
    userIntentState.delete(email);
    return res.json({
      message: `Name updated to ${customer.first_name} ${customer.last_name}`
    });
  }
}






    // RAG STATIC FALLBACK

    const retrievedChunks = getRelevantChunks(message, 3);
    const isAppRelated = !!retrievedChunks;

    const systemPrompt = isAppRelated
      ? `You are an AI assistant for the ServiBid app.

Only answer using the following knowledge base. If unsure, say:
"I don't have that information currently. Please contact support@servibid.tech."

Knowledge Base:
${retrievedChunks.join("\n\n")}`
      : `You are a helpful AI assistant. Feel free to answer using general knowledge.`;

    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: message }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "HTTP-Referer": "http://localhost:3000"
        }
      }
    );

    const reply = response.data.choices?.[0]?.message?.content || "I wasn't able to process that.";
    res.status(200).json({ message: reply });
  } catch (err) {
    console.error("❌ ask-ai error:", err);
    res.status(500).json({ message: "AI assistant failed to respond." });
  }
});

}; 
    


// AI ends here
