
const fetch = global.fetch;

(async () => {
    const GAS_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzfrCsbZkBW7koRl73ArqxFt9BlvEv3Wy_Ezld9L0uiOEsdBkmNf_6aKm7v_Ub9oiyt/exec";

    const payload = {
        type: "INSERT",
        record: {
            id: `test-${Date.now()}`,
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

    console.log("Sending payload to GAS...");
    try {
        const response = await fetch(GAS_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Response Body:", text);

        try {
            const json = JSON.parse(text);
            console.log("JSON Parsed:", json);
        } catch (e) {
            console.log("Failed to parse JSON");
        }
    } catch (error) {
        console.error("Error:", error);
    }
})();
