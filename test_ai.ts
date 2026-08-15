import { getBrainConfig } from './src/shared/data.js';
import { tieredChat } from './src/core/tiered_ai.js';

async function test() {
  console.log('Loading Brain Config...');
  const brain = await getBrainConfig();
  console.log('Brain Config:', brain);
  
  console.log('\nTesting tieredChat with message: "halo"...');
  try {
    const res = await tieredChat(
      brain,
      [{ role: 'user', content: 'halo' }],
      [],
      {},
      'You are ANT.'
    );
    console.log('Success! Response:', res);
  } catch (err: any) {
    console.error('Test Failed with Error:', err);
  }
}

test();
