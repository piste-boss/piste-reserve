
const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzfrCsbZkBW7koRl73ArqxFt9BlvEv3Wy_Ezld9L0uiOEsdBkmNf_6aKm7v_Ub9oiyt/exec";

const payload = {
    type: "INSERT",
    record: {
        id: "debug-test-id-" + Date.now(),
        name: "Debug User",
        email: "debug@example.com",
        phone: "09000000000",
        reservation_date: "2026-02-28",
        reservation_time: "10:00",
        reservation_end_time: "11:00",
        menu_id: "trial-60",
        source: "web"
    }
};

console.log("Sending payload to GAS:", JSON.stringify(payload, null, 2));

try {
    const res = await fetch(GAS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response Body:", text);
} catch (e) {
    console.error("Error:", e);
}
