const Model = require('./model');

const provider = {
  type: 'provider',
  name: 'duckdb',
  hosts: false,
  disableIdParam: false,
  Model,
  version: require('../package.json').version,
};

module.exports = provider;
