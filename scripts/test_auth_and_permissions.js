require("dotenv").config();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const Admin = require("../models/Admin");
const { adminlogin } = require("../controllers/adminController");
const { adminProtect, restrictTo } = require("../middlewares/authMiddleware");

// Mock Express req & res
function createMockReqRes(body = {}, headers = {}, cookies = {}) {
  const req = {
    body,
    headers,
    cookies,
    get: (h) => headers[h.toLowerCase()] || headers[h],
  };

  let responseData = null;
  let statusCode = 200;
  let setCookies = {};

  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    cookie: (name, value, opts) => {
      setCookies[name] = { value, opts };
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    },
    send: (data) => {
      responseData = data;
      return res;
    },
    _getData: () => responseData,
    _getStatus: () => statusCode,
    _getCookies: () => setCookies,
  };

  return { req, res };
}

async function runTests() {
  console.log("🧪 Starting Authentication & Authorization Tests...\n");
  await connectDB();

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Test 1: Admin Login with Username
  // -------------------------------------------------------------
  console.log("Test 1: Admin Login using Username (bebo269)...");
  const { req: req1, res: res1 } = createMockReqRes({
    username: "bebo269",
    password: "Montres#2026",
  });
  await adminlogin(req1, res1);
  const data1 = res1._getData();
  const status1 = res1._getStatus();

  assert(status1 === 200, `Status code is 200 (got ${status1})`);
  assert(data1?.token !== undefined, "JWT token is returned");
  assert(data1?.admin?.role === "content_manager", `Admin role is 'content_manager' (got ${data1?.admin?.role})`);
  assert(data1?.admin?.email === "bebo269@yahoo.com", `Email is 'bebo269@yahoo.com' (got ${data1?.admin?.email})`);

  // -------------------------------------------------------------
  // Test 2: Admin Login with Email
  // -------------------------------------------------------------
  console.log("\nTest 2: Admin Login using Email (bebo269@yahoo.com)...");
  const { req: req2, res: res2 } = createMockReqRes({
    email: "bebo269@yahoo.com",
    password: "Montres#2026",
  });
  await adminlogin(req2, res2);
  const data2 = res2._getData();
  const status2 = res2._getStatus();

  assert(status2 === 200, `Status code is 200 (got ${status2})`);
  assert(data2?.token !== undefined, "JWT token is returned");
  assert(data2?.admin?.username === "bebo269", `Username is 'bebo269' (got ${data2?.admin?.username})`);

  // -------------------------------------------------------------
  // Test 3: JWT Token Verification & Payload
  // -------------------------------------------------------------
  console.log("\nTest 3: Verify Decoded JWT Token Payload...");
  const token = data1.token;
  const decoded = jwt.verify(token, process.env.ADMIN_JWT_SECRET);

  assert(decoded.isAdmin === true, "Token contains isAdmin: true");
  assert(decoded.role === "content_manager", `Token contains role: 'content_manager' (got ${decoded.role})`);
  assert(decoded.username === "bebo269", `Token contains username: 'bebo269' (got ${decoded.username})`);
  assert(decoded.email === "bebo269@yahoo.com", `Token contains email: 'bebo269@yahoo.com' (got ${decoded.email})`);

  // -------------------------------------------------------------
  // Test 4: adminProtect Middleware with Bearer Token
  // -------------------------------------------------------------
  console.log("\nTest 4: adminProtect Middleware...");
  const { req: protectReq, res: protectRes } = createMockReqRes(
    {},
    { authorization: `Bearer ${token}` }
  );

  let nextCalled = false;
  adminProtect(protectReq, protectRes, () => {
    nextCalled = true;
  });

  assert(nextCalled === true, "adminProtect called next() successfully");
  assert(protectReq.admin?.role === "content_manager", `req.admin.role is set to 'content_manager'`);
  assert(protectReq.admin?.username === "bebo269", `req.admin.username is 'bebo269'`);

  // -------------------------------------------------------------
  // Test 5: restrictTo Middleware Permissions Check
  // -------------------------------------------------------------
  console.log("\nTest 5: restrictTo Permission Checks...");
  let restrictProductDeletePassed = false;
  const productDeleteMiddleware = restrictTo("ceo", "developer", "content_manager");
  productDeleteMiddleware(protectReq, protectRes, () => {
    restrictProductDeletePassed = true;
  });
  assert(restrictProductDeletePassed === true, "content_manager allowed on delete product route");

  let restrictUnauthorizedPassed = false;
  const { req: unauthReq, res: unauthRes } = createMockReqRes();
  unauthReq.admin = { role: "content_manager" };
  const restrictedMiddleware = restrictTo("ceo", "developer");
  restrictedMiddleware(unauthReq, unauthRes, () => {
    restrictUnauthorizedPassed = true;
  });
  assert(
    restrictUnauthorizedPassed === false && unauthRes._getStatus() === 403,
    "Non-matching roles correctly blocked with 403"
  );

  // -------------------------------------------------------------
  // Test 6: Invalid Password Test
  // -------------------------------------------------------------
  console.log("\nTest 6: Invalid Credentials Handling...");
  const { req: reqBad, res: resBad } = createMockReqRes({
    username: "bebo269",
    password: "WrongPassword123!",
  });
  await adminlogin(reqBad, resBad);
  assert(resBad._getStatus() === 401, "Invalid password returns 401 status");

  console.log(`\n==========================================`);
  console.log(`🏁 Total Tests: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`==========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
