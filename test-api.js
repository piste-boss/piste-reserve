async function testKey() {
    const key = "AIzaSyB35EmmHGKlc8_apokVLcPiA47WykrG_E8";
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        console.log("Status:", res.status);
        if (data.models) {
            console.log("Models found:", data.models.map(m => m.name).join(", "));
        } else {
            console.log("Response:", JSON.stringify(data, null, 2));
        }
    } catch (e) {
        console.error("Fetch Error:", e.message);
    }
}

testKey();
