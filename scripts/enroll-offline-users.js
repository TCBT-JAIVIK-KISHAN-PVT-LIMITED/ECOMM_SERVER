/**
 * Script to grant course access to offline paid users.
 *
 * Usage:
 *   node scripts/enroll-offline-users.js 9876543210 9123456789
 *
 * Or add phone numbers to the OFFLINE_USERS list below and run:
 *   node scripts/enroll-offline-users.js
 */

const COURSE_ID = 'tcbt-organic-farming-101';
const API_URL = 'http://localhost:3000/users/enroll';

// Add offline paid mobile numbers here:
const OFFLINE_USERS = [
  // '9876543210',
  // '9123456789',
];

async function enrollUser(mobile) {
  const cleanMobile = mobile.trim();
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mobile_number: cleanMobile,
        course_id: COURSE_ID,
      }),
    });

    const data = await res.json();
    if (res.ok && data.success) {
      console.log(`✅ [ENROLLED] ${cleanMobile} -> ${data.message}`);
    } else {
      console.error(`❌ [FAILED] ${cleanMobile} ->`, data);
    }
  } catch (err) {
    console.error(`⚠️ [ERROR] ${cleanMobile} -> ${err.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args : OFFLINE_USERS;

  if (targets.length === 0) {
    console.log(`\nUsage:`);
    console.log(`  node scripts/enroll-offline-users.js <mobile1> <mobile2> ...\n`);
    console.log(`Example:`);
    console.log(`  node scripts/enroll-offline-users.js 9876543210 9123456789\n`);
    console.log(`Or edit scripts/enroll-offline-users.js and add numbers to OFFLINE_USERS array.\n`);
    return;
  }

  console.log(`\n🎓 Enrolling ${targets.length} user(s) into course: "${COURSE_ID}"...\n`);

  for (const mobile of targets) {
    await enrollUser(mobile);
  }

  console.log(`\n✨ Done!\n`);
}

main();
