/**
 * AWS Lambda Function for JavaScript/TypeScript Code Validation
 * Uses Babel for AST parsing and transpilation
 */

const { transformSync } = require('@babel/core');

exports.handler = async (event) => {
  console.log('🔍 Validation Lambda: Processing request');
  
  try {
    // Parse the request
    const { code, options = {}, jobId } = typeof event.body === 'string' 
      ? JSON.parse(event.body) 
      : event;

    if (!code) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          isValid: false,
          error: 'No code provided for validation'
        })
      };
    }

    console.log(`🔍 Validation Lambda: Validating code for jobId: ${jobId}, length: ${code.length}`);

    // Default Babel options for React TypeScript
    const babelOptions = {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
        '@babel/preset-typescript'
      ],
      plugins: [
        '@babel/plugin-syntax-jsx',
        '@babel/plugin-transform-typescript'
      ],
      sourceType: 'module',
      ...options
    };

    let validationResult = {
      isValid: false,
      syntaxErrors: [],
      transpiled: {
        successful: false,
        code: null
      }
    };

    try {
      // Attempt to parse and transform the code
      const result = transformSync(code, babelOptions);
      
      if (result && result.code) {
        validationResult = {
          isValid: true,
          syntaxErrors: [],
          transpiled: {
            successful: true,
            code: result.code
          }
        };
        
        console.log(`🔍 Validation Lambda: Code validation successful for jobId: ${jobId}`);
      } else {
        validationResult.error = 'Babel transformation returned no result';
        console.warn(`🔍 Validation Lambda: Babel returned no result for jobId: ${jobId}`);
      }

    } catch (babelError) {
      console.error(`🔍 Validation Lambda: Babel error for jobId: ${jobId}:`, babelError);
      
      // Parse Babel error for detailed syntax information
      const syntaxErrors = [];
      
      if (babelError.loc) {
        syntaxErrors.push({
          line: babelError.loc.line,
          column: babelError.loc.column,
          message: babelError.message
        });
      } else {
        syntaxErrors.push({
          line: 1,
          column: 1,
          message: babelError.message || 'Unknown syntax error'
        });
      }

      validationResult = {
        isValid: false,
        error: `Syntax Error: ${babelError.message}`,
        details: {
          babelError: {
            name: babelError.name,
            message: babelError.message,
            loc: babelError.loc,
            codeFrame: babelError.codeFrame
          }
        },
        syntaxErrors,
        transpiled: {
          successful: false,
          code: null
        }
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(validationResult)
    };

  } catch (error) {
    console.error('🔍 Validation Lambda: Handler error:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        isValid: false,
        error: 'Internal server error during validation',
        details: {
          message: error.message
        }
      })
    };
  }
}; 