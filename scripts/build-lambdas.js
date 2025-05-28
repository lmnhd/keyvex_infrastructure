const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const LAMBDA_DIR = path.join(__dirname, '..', 'lambda');
const DIST_DIR = path.join(__dirname, '..', 'dist', 'lambda');
const LAMBDA_FUNCTIONS = [
  'ai-processor',
  'analytics-processor',
  'websocket-handler',
  'email-processor'
];

// Shared dependencies that all Lambda functions need
const SHARED_DEPENDENCIES = {
  '@aws-sdk/client-dynamodb': '^3.400.0',
  '@aws-sdk/lib-dynamodb': '^3.400.0',
  '@aws-sdk/client-secrets-manager': '^3.400.0',
  '@aws-sdk/client-sqs': '^3.400.0'
};

const SHARED_DEV_DEPENDENCIES = {
  '@types/aws-lambda': '^8.10.119',
  '@types/node': '^20.6.0',
  'typescript': '^5.2.2'
};

async function createZipFile(functionName, sourceDir) {
  // Ensure dist directory exists
  if (!fs.existsSync(DIST_DIR)) {
    fs.mkdirSync(DIST_DIR, { recursive: true });
  }

  const zipPath = path.join(DIST_DIR, `${functionName}.zip`);
  
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`✅ Created ${functionName}.zip (${archive.pointer()} bytes)`);
      resolve(zipPath);
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    
    // Add all files from the dist directory
    archive.directory(sourceDir, false);
    
    archive.finalize();
  });
}

async function buildLambda(functionName) {
  const functionDir = path.join(LAMBDA_DIR, functionName);
  const srcDir = path.join(functionDir, 'src');
  const distDir = path.join(functionDir, 'dist');
  
  console.log(`Building ${functionName}...`);
  
  // Check if source directory exists
  if (!fs.existsSync(srcDir)) {
    console.warn(`Warning: Source directory not found for ${functionName}, creating placeholder...`);
    
    // Create placeholder structure
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });
    
    // Create placeholder handler
    const handlerCode = `
import { Handler, Context, APIGatewayProxyEvent, SQSEvent } from 'aws-lambda';

export const handler: Handler = async (event: APIGatewayProxyEvent | SQSEvent, context: Context) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context:', JSON.stringify(context, null, 2));
  
  // TODO: Implement ${functionName} logic
  console.log('${functionName} function called - placeholder implementation');
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: '${functionName} executed successfully',
      timestamp: new Date().toISOString(),
      functionName: '${functionName}'
    })
  };
};
`;
    
    fs.writeFileSync(path.join(srcDir, 'index.ts'), handlerCode);
    console.log(`Created placeholder structure for ${functionName}`);
  }

  // Create or update package.json with all required dependencies
  const packageJsonPath = path.join(functionDir, 'package.json');
  let packageJson = {
    name: `keyvex-${functionName}`,
    version: '1.0.0',
    description: `Keyvex ${functionName} Lambda function`,
    main: 'index.js',
    dependencies: { ...SHARED_DEPENDENCIES },
    devDependencies: { ...SHARED_DEV_DEPENDENCIES }
  };

  // Add function-specific dependencies
  if (functionName === 'websocket-handler') {
    packageJson.dependencies['@aws-sdk/client-apigatewaymanagementapi'] = '^3.400.0';
  }
  if (functionName === 'email-processor') {
    packageJson.dependencies['@aws-sdk/client-ses'] = '^3.400.0';
  }

  // Read existing package.json if it exists and merge
  if (fs.existsSync(packageJsonPath)) {
    try {
      const existingPackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      packageJson = {
        ...existingPackageJson,
        dependencies: { ...packageJson.dependencies, ...existingPackageJson.dependencies },
        devDependencies: { ...packageJson.devDependencies, ...existingPackageJson.devDependencies }
      };
    } catch (error) {
      console.warn(`Warning: Could not parse existing package.json for ${functionName}, using defaults`);
    }
  }

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  // Create or update TypeScript config
  const tsConfigPath = path.join(functionDir, 'tsconfig.json');
  const tsConfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'commonjs',
      lib: ['ES2020'],
      outDir: './dist',
      rootDir: './',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      declaration: false,
      sourceMap: false
    },
    include: ['src/**/*', 'shared/**/*'],
    exclude: ['node_modules', 'dist']
  };

  fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
  
  // Clean dist directory
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });
  
  try {
    // Install all dependencies (including dev dependencies for compilation)
    console.log(`Installing dependencies for ${functionName}...`);
    execSync('npm install', { 
      cwd: functionDir, 
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' }
    });

    // Copy shared utilities to function directory for compilation
    const sharedDir = path.join(LAMBDA_DIR, 'shared');
    const functionSharedDir = path.join(functionDir, 'shared');
    
    if (fs.existsSync(sharedDir)) {
      // Remove existing shared directory
      if (fs.existsSync(functionSharedDir)) {
        fs.rmSync(functionSharedDir, { recursive: true, force: true });
      }
      
      // Copy shared directory
      fs.mkdirSync(functionSharedDir, { recursive: true });
      const sharedFiles = fs.readdirSync(sharedDir);
      sharedFiles.forEach(file => {
        fs.copyFileSync(
          path.join(sharedDir, file),
          path.join(functionSharedDir, file)
        );
      });
    }

    // Update TypeScript config to include shared files
    const updatedTsConfig = {
      ...tsConfig,
      include: ['src/**/*', 'shared/**/*']
    };
    fs.writeFileSync(tsConfigPath, JSON.stringify(updatedTsConfig, null, 2));
    
    // Compile TypeScript
    console.log(`Compiling TypeScript for ${functionName}...`);
    execSync('npx tsc', { 
      cwd: functionDir, 
      stdio: 'inherit' 
    });
    
    // Copy package.json to dist (production only)
    const prodPackageJson = {
      name: packageJson.name,
      version: packageJson.version,
      main: packageJson.main,
      dependencies: packageJson.dependencies || {}
    };
    fs.writeFileSync(
      path.join(distDir, 'package.json'), 
      JSON.stringify(prodPackageJson, null, 2)
    );
    
    // Install production dependencies in dist
    console.log(`Installing production dependencies for ${functionName}...`);
    execSync('npm install --production', { 
      cwd: distDir,
      stdio: 'inherit'
    });

    // Clean up temporary shared directory
    if (fs.existsSync(functionSharedDir)) {
      fs.rmSync(functionSharedDir, { recursive: true, force: true });
    }

    // Create ZIP file for CDK deployment
    const zipPath = await createZipFile(functionName, distDir);
    
    console.log(`✅ Successfully built ${functionName}`);
    
    return {
      functionName,
      zipPath,
      success: true
    };
    
  } catch (error) {
    console.error(`❌ Failed to build ${functionName}:`, error.message);
    
    // Clean up temporary shared directory on error
    const functionSharedDir = path.join(functionDir, 'shared');
    if (fs.existsSync(functionSharedDir)) {
      fs.rmSync(functionSharedDir, { recursive: true, force: true });
    }
    
    return {
      functionName,
      zipPath: null,
      success: false,
      error: error.message
    };
  }
}

async function buildAllLambdas() {
  console.log('🚀 Starting Lambda build process...\n');
  
  // Create lambda directory if it doesn't exist
  if (!fs.existsSync(LAMBDA_DIR)) {
    fs.mkdirSync(LAMBDA_DIR, { recursive: true });
  }
  
  const results = [];
  
  // Build each Lambda function
  for (const functionName of LAMBDA_FUNCTIONS) {
    try {
      const result = await buildLambda(functionName);
      results.push(result);
      console.log(''); // Add spacing between functions
    } catch (error) {
      console.error(`Failed to build ${functionName}, continuing with others...`);
      results.push({
        functionName,
        zipPath: null,
        success: false,
        error: error.message
      });
      console.log(''); // Add spacing
    }
  }
  
  // Create build manifest for CDK
  const manifest = {
    buildTime: new Date().toISOString(),
    functions: results.reduce((acc, result) => {
      acc[result.functionName] = {
        zipPath: result.zipPath,
        success: result.success,
        error: result.error
      };
      return acc;
    }, {})
  };
  
  const manifestPath = path.join(DIST_DIR, 'build-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  
  console.log('🎉 Lambda build process completed!');
  console.log(`📋 Build manifest created at: ${manifestPath}`);
  
  const successCount = results.filter(r => r.success).length;
  const failureCount = results.filter(r => !r.success).length;
  
  console.log(`✅ Successfully built: ${successCount} functions`);
  if (failureCount > 0) {
    console.log(`❌ Failed to build: ${failureCount} functions`);
  }
  
  console.log('\nNext steps:');
  console.log('1. Review the generated Lambda functions in the lambda/ directory');
  console.log('2. Implement the actual business logic in each function');
  console.log('3. Run "npm run deploy" to deploy the infrastructure');
  
  return manifest;
}

// Run the build process
if (require.main === module) {
  buildAllLambdas().catch(error => {
    console.error('Build process failed:', error);
    process.exit(1);
  });
}

module.exports = { buildLambda, buildAllLambdas, createZipFile }; 