if (process.env.NODE_INV === 'production') {
    module.exports = require('./prod');
} else {
    module.exports = require('./dev');
}