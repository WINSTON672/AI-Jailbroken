require('esbuild').buildSync({entryPoints:['app/editor-entry.js'],bundle:true,minify:true,format:'iife',outfile:'app/editor-bundle.js',platform:'browser',target:'chrome140'});
