/* eslint-disable @typescript-eslint/no-var-requires, no-undef, import/no-extraneous-dependencies */
module.exports = {
  presets: [['@babel/env', ], ],
  plugins: [
    [
      '@babel/plugin-transform-runtime',
      { corejs: 3, },
    ],
    [
      '@babel/plugin-proposal-class-properties',
      {
        onlyRemoveTypeImports: true,
      },
    ],
    ['@babel/plugin-transform-typescript', ],
  ],
  env: {
    test: {
      presets: ['@babel/env', ],
    },
  },
}
