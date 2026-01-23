const reportService = require('../src/services/reportService');
const aiService = require('../src/services/aiService');
const clientService = require('../src/services/clientService');

async function debugClient82() {
    console.log("--- Debugging Client 82 ---");

    // 1. Mock AI Service to capture prompt
    const originalGetCompletion = aiService.getCompletion;
    let capturedPrompt = "";
    aiService.getCompletion = async (messages, model) => {
        const systemMsg = messages.find(m => m.role === 'system');
        if (systemMsg) capturedPrompt = systemMsg.content;
        return "MOCKED_SUMMARY";
    };

    try {
        // 2. Fetch Report Data
        console.log("Fetching report data...");
        const reportData = await reportService.getClientReportData(82);

        // 3. Inspect Goals
        console.log("\n--- Goals Inspection ---");
        const goals = reportData.goals_detailed || [];
        const lifeGoals = goals.filter(g => g.goal_type === 'LIFE' || g.goal_id === 5);

        console.log(`Total Goals: ${goals.length}`);
        console.log(`Life Insurance Goals: ${lifeGoals.length}`);

        lifeGoals.forEach((g, i) => {
            console.log(`\nLife Goal #${i + 1}:`);
            console.log(`ID: ${g.goal_id}`);
            console.log(`Name: ${g.goal_name}`);
            console.log(`Has Details: ${!!g.details}`);
            if (g.details) {
                console.log(`Risks Array Length: ${g.details.risks ? g.details.risks.length : 'N/A'}`);
                console.log(`Risks Data:`, JSON.stringify(g.details.risks, null, 2));
            }
        });

        // 4. Check Prompt
        console.log("\n--- Prompt Inspection ---");
        if (capturedPrompt.includes("СТРАХОВАЯ ЗАЩИТА")) {
            console.log("[SUCCESS] 'СТРАХОВАЯ ЗАЩИТА' section FOUND in prompt.");
            const section = capturedPrompt.split("СТРАХОВАЯ ЗАЩИТА")[1].split("ИНСТРУКЦИЯ")[0];
            console.log("Captured Section Content:");
            console.log(section.trim());
        } else {
            console.log("[FAILURE] 'СТРАХОВАЯ ЗАЩИТА' section NOT FOUND in prompt.");
        }

    } catch (e) {
        console.error("Debug Error:", e);
    } finally {
        aiService.getCompletion = originalGetCompletion;
        process.exit();
    }
}

debugClient82();
