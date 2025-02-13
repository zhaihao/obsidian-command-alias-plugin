import { Command, Notice, Plugin } from 'obsidian';
import { AppExtension } from "./uncover-obsidian";
import { CommandAliasPluginSettingTab } from "./setting-tab";
import { CommandSuggestionModal } from "./add-alias-modal";
interface CommandAliasPluginSettings {
    aliases: AliasMap;
    commandDetection: {
        maxTry: number;
        msecOfInterval: number;
    }
}

type AliasMap = {
    [key: string]: Alias;
}
interface Alias {
    name: string;
    commandId: string;
}

const DEFAULT_SETTINGS: CommandAliasPluginSettings = {
    aliases: {},
    commandDetection: {
        maxTry: 5,
        msecOfInterval: 200
    }
}

async function timeoutPromise(msec: number) {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(null);
        }, msec);
    });
}

export default class CommandAliasPlugin extends Plugin {
    settings: CommandAliasPluginSettings;

    async onload() {
        // const app = this.app as AppExtension;

        await this.loadSettings();

        this.addCommand({
            id: "add-alias",
            name: "Add command alias",
            callback: () => {
                const modal = new CommandSuggestionModal(this.app, this);
                modal.open();
            },
        });

        this.addSettingTab(new CommandAliasPluginSettingTab(this.app, this));

        const promises: Array<Promise<void>> = [];
        for (const aliasId in this.settings.aliases) {
            if (!Object.prototype.hasOwnProperty.call(this.settings.aliases, aliasId)) {
                continue;
            }
            const p = this.addAliasCommand(aliasId);
            promises.push(p);
        }
        await Promise.all(promises);
    }

    private async addAliasCommand(aliasId: string) {
        const app = this.app as AppExtension;
        const { maxTry, msecOfInterval } = this.settings.commandDetection;

        const alias = this.settings.aliases[aliasId];
        const detection = async () => {
            for (let tried = 0; tried < maxTry; tried += 1) {
                const ref = app.commands.commands[alias.commandId];
                if (ref != null) {
                    return Promise.resolve(ref);
                }
                await timeoutPromise(msecOfInterval)
            }
            return Promise.reject("Missing command");
        };
        const commandDetection = detection().then((target: Command) => {
            const command: Command = {
                id: `alias:${aliasId}`,
                // name: `${alias.name}: ${target.name}`,
                name: `${alias.name}`,
            };
            if (target.callback) {
                command.callback = () => {
                    const target = app.commands.commands[alias.commandId];
                    if (!target) {
                        new Notice("Missing command. The command may be invalid.");
                        return;
                    }
                    if (target.callback) {
                        target.callback();
                    }
                };
            }
            if (target.checkCallback) {
                command.checkCallback = (checking) => {
                    const target = app.commands.commands[alias.commandId];
                    if (!target) {
                        if (checking) {
                            // Don't hide the probrem.
                            return true;
                        }
                        new Notice("Missing command. The command may be invalid.");
                        return;
                    }
                    if (target.checkCallback) {
                        return target.checkCallback(checking);
                    }
                }
            }
            this.addCommand(command);
        }).catch((reason) => {
            // fallback
            const command: Command = {
                id: `alias:${aliasId}`,
                name: `${alias.name}: Missing command. Run this and try rebinding.`,
                callback: () => {
                    this.unload();
                    this.load();
                }
            }
            this.addCommand(command);
        });

        return commandDetection;
    }

    onunload() {
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    addAliasSetting(aliasName: string, commandId: string) {
        const aliasId = Date.now().toString();
        // console.log('Add id:', aliasId, 'alias:', aliasName, "command:", commandId);
        this.settings.aliases[aliasId] = {
            name: aliasName,
            commandId: commandId,
        }
    }
}
