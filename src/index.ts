import { run } from '@oclif/core';

// Run the CLI
run(process.argv.slice(2))
  .catch((error: Error) => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });
