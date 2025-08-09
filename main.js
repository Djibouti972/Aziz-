//////////////////////////////////////////////////////
//========= Require all variable need use =========//
/////////////////////////////////////////////////////
const moment = require("moment-timezone");
const { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } = require("fs-extra");
const { join, resolve } = require("path");
const { execSync } = require('child_process');
const logger = require("./utils/log.js");
const login = require("@dongdev/fca-unofficial");
const axios = require("axios");
const listPackage = JSON.parse(readFileSync('./package.json')).dependencies;
const listbuiltinModules = require("module").builtinModules;

global.client = new Object({
    commands: new Map(),
    events: new Map(),
    cooldowns: new Map(),
    eventRegistered: new Array(),
    handleSchedule: new Array(),
    handleReaction: new Array(),
    handleReply: new Array(),
    mainPath: process.cwd(),
    configPath: new String(),
    getTime: function (option) {
        switch (option) {
            case "seconds":
                return `${moment.tz("Asia/Ho_Chi_minh").format("ss")}`;
            case "minutes":
                return `${moment.tz("Asia/Ho_Chi_minh").format("mm")}`;
            case "hours":
                return `${moment.tz("Asia/Ho_Chi_minh").format("HH")}`;
            case "date": 
                return `${moment.tz("Asia/Ho_Chi_minh").format("DD")}`;
            case "month":
                return `${moment.tz("Asia/Ho_Chi_minh").format("MM")}`;
            case "year":
                return `${moment.tz("Asia/Ho_Chi_minh").format("YYYY")}`;
            case "fullHour":
                return `${moment.tz("Asia/Ho_Chi_minh").format("HH:mm:ss")}`;
            case "fullYear":
                return `${moment.tz("Asia/Ho_Chi_minh").format("DD/MM/YYYY")}`;
            case "fullTime":
                return `${moment.tz("Asia/Ho_Chi_minh").format("HH:mm:ss DD/MM/YYYY")}`;
        }
    }
});

global.data = new Object({
    threadInfo: new Map(),
    threadData: new Map(),
    userName: new Map(),
    userBanned: new Map(),
    threadBanned: new Map(),
    commandBanned: new Map(),
    threadAllowNSFW: new Array(),
    allUserID: new Array(),
    allCurrenciesID: new Array(),
    allThreadID: new Array()
});

global.utils = require("./utils");
global.nodemodule = new Object();
global.config = new Object();
global.configModule = new Object();
global.moduleData = new Array();
global.language = new Object();

//////////////////////////////////////////////////////////
//========= Find and get variable from Config =========//
/////////////////////////////////////////////////////////

var configValue;
try {
    global.client.configPath = join(global.client.mainPath, "config.json");
    configValue = require(global.client.configPath);
} catch {
    if (existsSync(global.client.configPath.replace(/\.json/g,"") + ".temp")) {
        configValue = readFileSync(global.client.configPath.replace(/\.json/g,"") + ".temp");
        configValue = JSON.parse(configValue);
        logger.loader(`Found: ${global.client.configPath.replace(/\.json/g,"") + ".temp"}`);
    }
}

try {
    for (const key in configValue) global.config[key] = configValue[key];
} catch {
    logger.loader("Can't load file config!", "error");
}

const { Sequelize, sequelize } = require("./includes/database");

writeFileSync(global.client.configPath + ".temp", JSON.stringify(global.config, null, 4), 'utf8');

/////////////////////////////////////////
//========= Load language use =========//
/////////////////////////////////////////

const langFile = (readFileSync(`${__dirname}/languages/${global.config.language || "en"}.lang`, { encoding: 'utf-8' })).split(/\r?\n|\r/);
const langData = langFile.filter(item => item.indexOf('#') != 0 && item != '');
for (const item of langData) {
    const getSeparator = item.indexOf('=');
    const itemKey = item.slice(0, getSeparator);
    const itemValue = item.slice(getSeparator + 1, item.length);
    const head = itemKey.slice(0, itemKey.indexOf('.'));
    const key = itemKey.replace(head + '.', '');
    const value = itemValue.replace(/\\n/gi, '\n');
    if (typeof global.language[head] == "undefined") global.language[head] = new Object();
    global.language[head][key] = value;
}

global.getText = function (...args) {
    const langText = global.language;    
    if (!langText.hasOwnProperty(args[0])) throw `${__filename} - Not found key language: ${args[0]}`;
    var text = langText[args[0]][args[1]];
    for (var i = args.length - 1; i > 0; i--) {
        const regEx = RegExp(`%${i}`, 'g');
        text = text.replace(regEx, args[i + 1]);
    }
    return text;
}

try {
    var appStateFile = resolve(join(global.client.mainPath, global.config.APPSTATEPATH || "appstate.json"));
    var appState = require(appStateFile);
} catch {
    return logger.loader(global.getText("mirai", "notFoundPathAppstate"), "error");
}

////////////////////////////////////////////////////////////
//========= Login account and start Listen Event =========//
////////////////////////////////////////////////////////////

function onBot({ models: botModel }) {
    const loginData = {};
    loginData['appState'] = appState;
    login(loginData, async(loginError, loginApiData) => {
        if (loginError) return logger(JSON.stringify(loginError), `ERROR`);
        loginApiData.setOptions(global.config.FCAOption);
        global.client.api = loginApiData;
        global.config.version = '1.2.14';
        global.client.timeStart = new Date().getTime();

        // Load commands
        (function () {
            const listCommand = readdirSync(global.client.mainPath + '/modules/commands').filter(command => command.endsWith('.js') && !command.includes('example') && !global.config.commandDisabled.includes(command));
            for (const command of listCommand) {
                try {
                    var module = require(global.client.mainPath + '/modules/commands/' + command);
                    if (!module.config || !module.run || !module.config.commandCategory) throw new Error(global.getText('mirai', 'errorFormat'));
                    if (global.client.commands.has(module.config.name || '')) throw new Error(global.getText('mirai', 'nameExist'));

                    if (module.config.dependencies && typeof module.config.dependencies == 'object') {
                        for (const reqDependencies in module.config.dependencies) {
                            const reqDependenciesPath = join(__dirname, 'nodemodules', 'node_modules', reqDependencies);
                            try {
                                if (!global.nodemodule.hasOwnProperty(reqDependencies)) {
                                    if (listPackage.hasOwnProperty(reqDependencies) || listbuiltinModules.includes(reqDependencies)) global.nodemodule[reqDependencies] = require(reqDependencies);
                                    else global.nodemodule[reqDependencies] = require(reqDependenciesPath);
                                }
                            } catch {
                                logger.loader(global.getText('mirai', 'notFoundPackage', reqDependencies, module.config.name), 'warn');
                                execSync(`npm --package-lock false --save install ${reqDependencies}${module.config.dependencies[reqDependencies] == '*' || module.config.dependencies[reqDependencies] == '' ? '' : '@' + module.config.dependencies[reqDependencies]}`, { stdio: 'inherit', env: process.env, shell: true, cwd: join(__dirname, 'nodemodules') });
                                for (let i = 1; i <= 3; i++) {
                                    try {
                                        require.cache = {};
                                        if (listPackage.hasOwnProperty(reqDependencies) || listbuiltinModules.includes(reqDependencies)) global.nodemodule[reqDependencies] = require(reqDependencies);
                                        else global.nodemodule[reqDependencies] = require(reqDependenciesPath);
                                        break;
                                    } catch (error) {}
                                }
                            }
                        }
                    }

                    if (module.config.envConfig) {
                        for (const envConfig in module.config.envConfig) {
                            if (typeof global.configModule[module.config.name] == 'undefined') global.configModule[module.config.name] = {};
                            if (typeof global.config[module.config.name] == 'undefined') global.config[module.config.name] = {};
                            if (typeof global.config[module.config.name][envConfig] !== 'undefined') global.configModule[module.config.name][envConfig] = global.config[module.config.name][envConfig];
                            else global.configModule[module.config.name][envConfig] = module.config.envConfig[envConfig] || '';
                            if (typeof global.config[module.config.name][envConfig] == 'undefined') global.config[module.config.name][envConfig] = module.config.envConfig[envConfig] || '';
                        }
                    }

                    if (module.onLoad) {
                        const moduleData = { api: loginApiData, models: botModel };
                        module.onLoad(moduleData);
                    }

                    if (module.handleEvent) global.client.eventRegistered.push(module.config.name);
                    global.client.commands.set(module.config.name, module);
                } catch (error) {}
            }
        })();

        // Load events
        (function () {
            const events = readdirSync(global.client.mainPath + '/modules/events').filter(event => event.endsWith('.js') && !global.config.eventDisabled.includes(event));
            for (const ev of events) {
                try {
                    var event = require(global.client.mainPath + '/modules/events/' + ev);
                    if (!event.config || !event.run) throw new Error(global.getText('mirai', 'errorFormat'));
                    if (global.client.events.has(event.config.name || '')) throw new Error(global.getText('mirai', 'nameExist'));

                    if (event.config.dependencies && typeof event.config.dependencies == 'object') {
                        for (const dependency in event.config.dependencies) {
                            const depPath = join(__dirname, 'nodemodules', 'node_modules', dependency);
                            try {
                                if (!global.nodemodule.hasOwnProperty(dependency)) {
                                    if (listPackage.hasOwnProperty(dependency) || listbuiltinModules.includes(dependency)) global.nodemodule[dependency] = require(dependency);
                                    else global.nodemodule[dependency] = require(depPath);
                                }
                            } catch {
                                logger.loader(global.getText('mirai', 'notFoundPackage', dependency, event.config.name), 'warn');
                                execSync(`npm --package-lock false --save install ${dependency}${event.config.dependencies[dependency] == '*' || event.config.dependencies[dependency] == '' ? '' : '@' + event.config.dependencies[dependency]}`, { stdio: 'inherit', env: process.env, shell: true, cwd: join(__dirname, 'nodemodules') });
                                for (let i = 1; i <= 3; i++) {
                                    try {
                                        require.cache = {};
                                        if (listPackage.hasOwnProperty(dependency) || listbuiltinModules.includes(dependency)) global.nodemodule[dependency] = require(dependency);
                                        else global.nodemodule[dependency] = require(depPath);
                                        break;
                                    } catch (error) {}
                                }
                            }
                        }
                    }

                    if (event.config.envConfig) {
                        for (const envConfig in event.config.envConfig) {
                            if (typeof global.configModule[event.config.name] == 'undefined') global.configModule[event.config.name] = {};
                            if (typeof global.config[event.config.name] == 'undefined') global.config[event.config.name] = {};
                            if (typeof global.config[event.config.name][envConfig] !== 'undefined') global.configModule[event.config.name][envConfig] = global.config[event.config.name][envConfig];
                            else global.configModule[event.config.name][envConfig] = event.config.envConfig[envConfig] || '';
                            if (typeof global.config[event.config.name][envConfig] == 'undefined') global.config[event.config.name][envConfig] = event.config.envConfig[envConfig] || '';
                        }
                    }

                    if (event.onLoad) {
                        const eventData = { api: loginApiData, models: botModel };
                        event.onLoad(eventData);
                    }

                    global.client.events.set(event.config.name, event);
                } catch (error) {}
            }
        })();

        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        logger.loader(global.getText('mirai', 'finishLoadModule', global.client.commands.size, global.client.events.size));
        logger.loader(`Thời gian khởi động: ${((Date.now() - global.client.timeStart) / 1000).toFixed()}s`);
        logger.loader(`===== [ ${(Date.now() - global.client.timeStart)}ms ] =====`);

        writeFileSync(global.client.configPath, JSON.stringify(global.config, null, 4), 'utf8');
        unlinkSync(global.client.configPath + '.temp');

        const listenerData = { api: loginApiData, models: botModel };
        const listener = require('./includes/listen')(listenerData);

        function listenerCallback(error, message) {
            if (error) return logger(global.getText('mirai', 'handleListenError', JSON.stringify(error)), 'error');
            if (['presence', 'typ', 'read_receipt'].some(data => data == message.type)) return;
            if (global.config.DeveloperMode == true) console.log(message);
            return listener(message);
        }

        global.handleListen = loginApiData.listenMqtt(listenerCallback);
    });
}

//////////////////////////////////////////////
//========= Connecting to Database =========//
//////////////////////////////////////////////

(async () => {
    try {
        try {
            global.client.loggedMongoose = true;
            const { Model, DataTypes, Sequelize } = require("sequelize");
            const sequelize2 = new Sequelize({
                dialect: "sqlite",
                host: __dirname + '/includes/data.sqlite',
                logging: false
            });
            class dataModel extends Model {}
            dataModel.init({
                threadID: { type: DataTypes.STRING, primaryKey: true },
                data: { type: DataTypes.JSON, defaultValue: {} }
            }, {
                sequelize: sequelize2,
                modelName: "antists"
            });

            dataModel.findOneAndUpdate = async function (filter, update) {
                const doc = await this.findOne({ where: filter });
                if (!doc) return null;
                Object.keys(update).forEach(key => doc[key] = update[key]);
                await doc.save();
                return doc;
            };
            global.modelAntiSt = dataModel;
            await sequelize2.sync({ force: false });
        } catch (error) {
            global.client.loggedMongoose = false;
            logger.loader('Không thể kết nối dữ liệu ANTI SETTING', '[ CONNECT ]');
            console.log(error);
        }

        await sequelize.authenticate();
        const authentication = { Sequelize, sequelize };
        const models = require('./includes/database/model')(authentication);
        console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
        const botData = { models };
        onBot(botData);
    } catch (error) {
        logger(global.getText('mirai', 'successConnectDatabase', JSON.stringify(error)), '[ DATABASE ]');
    }
})();

const express = require('express');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const app = express();

const botURL = 'https://al-ex-wzz2.onrender.com';

function pingUrl(url) {
  const lib = url.startsWith('https') ? https : http;
  lib.get(url, (res) => {
    console.log('Ping sent to bot');
  }).on('error', (e) => {
    console.log(`Error pinging bot: ${e.message}`);
  });
}

setInterval(() => {
  pingUrl(botURL);
}, 40 * 1000);

app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'index.html');
  fs.readFile(htmlPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading HTML file');
    }
    res.send(data); // Send the content of index.html as the response
  });
});

process.on('unhandledRejection', (err, p) => {});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});