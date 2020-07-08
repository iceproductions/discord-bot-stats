const { args } = Deno;
import { parse } from "https://deno.land/std/flags/mod.ts";
import { readLines } from "https://deno.land/std/io/bufio.ts";
import { opine } from "https://deno.land/x/opine@main/mod.ts";
import * as dejs from 'https://deno.land/x/dejs@0.7.0/mod.ts';
import { WebSocket, WebSocketServer } from "https://deno.land/x/websocket/mod.ts";

class WebSocketServerExtended extends WebSocketServer {
    broadcast(message: string | object) {
        for(var connection of this.clients) {
            if(connection.isClosed) continue;
            try {
                connection.send(typeof message === "string" ? message : JSON.stringify(message));
            } catch(e) {
                console.warn(e);
            }
        }
    }
}

var flags = parse(args, {
    alias: {
        "stdin": ["useStdin", "s"],
        "port": "p"
    }
});

if(flags.port) {
    if(!Number.isInteger(flags.port)) {
        console.error("Port must be an integer");
        Deno.exit(1);
    }
} else flags.port = 8080;


const wss = new WebSocketServerExtended(flags.port + 1);
wss.on("connection", function (ws: WebSocket) {
    console.log("Connection active");
    ws.on("message", function (message: string) {
        console.log(message);
        ws.send(message)
    });
    ws.on("close", () => {
        console.log("Connection destroyed");
    });
});

if(!flags.stdin) {
    if(!flags._[0]) {
        console.error("You must specify service name if not using stdin!");
        Deno.exit(1);
    }
}

var type: string;
var errorPt: number = -1;
var changed: {
    [key: string]: boolean,
    dbl: boolean,
    reddit: boolean,
    lang: boolean,
    serverReady: boolean,
    ready: boolean,
    loaded: boolean,
    uses: boolean,
    users: boolean,
    guilds: boolean,
    errors: boolean
} = {
    dbl: false,
    reddit: false,
    lang: false,
    serverReady: false,
    ready: false,
    loaded: false,
    uses: false,
    users: false,
    guilds: false,
    errors: false
}

var data: {
    [key: string]: any,
    dbl: boolean | null,
    reddit: boolean,
    lang: boolean,
    serverReady: boolean,
    ready: boolean,
    loaded: Map<string, number>,
    uses: Map<string, number>,
    users: Map<string, number>,
    guilds: Map<string, number>,
    errors: string[]
} = {
    dbl: null,
    reddit: false,
    lang: false,
    serverReady: false,
    ready: false,
    loaded: new Map(),
    uses: new Map(),
    users: new Map(),
    guilds: new Map(),
    errors: []
};

function mapToObj(strMap: Map<string, any>) {
    let obj = Object.create(null);
    for (let [k,v] of strMap) {
        obj[k] = v;
    }
    return obj;
  }

setInterval(() => {
    var shouldUpdate = false;
    var updated: { [key: string]: any } = {};
    for(var val in changed) {
        if(changed[val]) shouldUpdate = true;
        changed[val] = false;
        updated[val] = data[val];
        if(updated[val] instanceof Map) {
            updated[val] = mapToObj(updated[val]);
        }
    }
    if(!shouldUpdate) return;

    wss.broadcast(updated);
}, 500);

async function parseLine(line: string, time: Date = new Date()) {
    console.log(line); //pass through

    try {
        var t = line.match(/\[([a-z1-9 ]+)\](.*)/i);
        var text = line;
        if(t && t[1]){
            type = t[1].trim().toUpperCase();
            if(type === "REJECTION") {
                if(errorPt !== -1) {
                    changed.errors = true;
                }
                errorPt++;
            }
            text = t[2].trim();
        } 
    } catch(e) {
        console.error(e);
        return;
    }

    switch(type) {
        case "DBL":
            console.warn(text);
            break;
        case "REJECTION":
            data.errors[errorPt] = (data.errors[errorPt] || "") + text;
            break;
        case "REDDIT":
            if(text === "Reddit connection successful") {
                data.reddit = true;
                changed.reddit = true;
            }
            break;
        case "LANG":
            if(text === "Loaded") {
                data.lang = true;
                changed.lang = true;
            }
            break;
        case "LOAD":
            var num = text.match(/\u001b\[37;1m([ 0-9]+)\u001b\[0m/i)![1];
            var group = text.match(/\u001b\[36m([a-z]+)\u001b\[0m/i)![1];
            data.loaded.set(group, Number(num));
            changed.loaded = true;
            break;
        case "SERVER":
            if(text === "Internal server ready") {
                data.serverReady = true;
                changed.serverReady = true;
            }
            break;
        case "USE":
            try {
                var guild = text.match(/\u001b\[35;1m\[([^\u001b]+)\] \u001b\[37;1m/i)![1];
                var tag = text.match(/\u001b\[37;1m\(([^\u001b]+)\)\u001b\[0m/i)![1];
                // var prefix = text.match(/\u001b\[4m([^\u001b]+)\u001b\[0m/i)![1];
                var command = text.match(/\u001b\[7m([^\u001b]+)\u001b\[0m/i)![1];
            } catch(e) {
                console.warn("[USE ERROR]", e);
                return;
            }

            if(guild) {
                data.guilds.set(guild, (data.guilds.get(guild) || 0) + 1);
                changed.guilds = true;
            }
            if(tag) {
                data.users.set(tag, (data.users.get(tag) || 0) + 1);
                changed.users = true;
            }
            if(command) {
                data.uses.set(command, (data.uses.get(command) || 0) + 1);
                changed.uses = true;
            }
            break;
        case "EVENT":
            switch(text) {
                case "\u001b[37;1m Ready!\u001b[0m":
                    data.ready = true;
                    changed.ready = true;
                    break;
            }
    }
}

const app = opine();

app.engine("ejs", dejs.renderFileToString);

app.get("/", async (req, res) => {
    res.render("main.ejs", {
        data,
        port: flags.port + 1
    });
});

app.listen(flags.port);

console.log("--PARSER server ready at http://localhost:" + flags.port + "/");

if(flags.stdin) {
    for await (const line of readLines(Deno.stdin)) {
        await parseLine(line);
    }
    console.log("End of input");
} else {
    console.error("Using services is not yet supported");
    Deno.exit(1);
}