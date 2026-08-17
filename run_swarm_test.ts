import { launchSwarmAudit, renderSwarmReport } from './src/core/agentic/swarm_orchestrator.js';

async function testSwarm() {
    console.log("Memulai Simulasi Operasi 3-Zona (OSINT Swarm)...");
    const result = await launchSwarmAudit("Investigasi Kebocoran Data (Dummy Target)", [
        "./workspace/dummy_target/target1.js"
    ]);
    renderSwarmReport(result);
}

testSwarm().catch(console.error);
