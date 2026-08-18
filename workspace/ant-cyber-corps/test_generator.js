import generator from './dataset_generator_pro.js';
import fs from 'fs';
import path from 'path';

async function runTest() {
    console.log('Testing DatasetGenerator Infrastructure...');
    try {
        // Test 1: Directory Setup
        const baseDir = path.resolve(process.cwd(), 'datasets');
        if (fs.existsSync(baseDir)) {
            console.log('Test 1: Base directory exists.');
        } else {
            throw new Error('Base directory was not created.');
        }

        // Test 2: Unit Sub-directories
        const units = ['gray-1', 'gray-2', 'gray-3', 'gray-4', 'gray-5'];
        units.forEach(unit => {
            if (fs.existsSync(path.join(baseDir, unit))) {
                console.log(`Test 2: Unit ${unit} directory exists.`);
            } else {
                throw new Error(`Unit directory ${unit} was not created.`);
            }
        });

        console.log('\nALL INFRASTRUCTURE TESTS PASSED!');
        process.exit(0);
    } catch (error) {
        console.error(`TEST FAILED: ${error.message}`);
        process.exit(1);
    }
}

runTest();