import path from 'path';

const models = require("../models");

// TODO sync. But we have to stop the server
// before listen for that. Don't know how to do it.
const sequelize = models.getSequelize(path.join(process.cwd()));

export default sequelize;
