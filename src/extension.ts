// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import axios, { AxiosError } from 'axios';


type PypiResult = {
	// https://warehouse.pypa.io/api-reference/json.html
	info: {
		version: string;
		description: string
	};
	releases: {
		[version: string]: [{
			upload_time: string
		}] | {}
	};
}

const Cache = new Map<string, PypiResult | null>();

async function fetchPackageData(packageName: string): Promise<PypiResult | null> {
	// get package's data from Pypi repository
	if (Cache.has(packageName)) {
		return Cache.get(packageName)!;
	} else {
		try {
			const data = (await axios(`https://pypi.org/pypi/${packageName}/json`)).data;
			Cache.set(packageName, data);
			return data;
		} catch (err: any) {
			if (axios.isAxiosError(err) && err.response?.status == 404) {
				Cache.set(packageName, null);
			}
			return null;
		}
	}
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	const completionProvider = vscode.languages.registerCompletionItemProvider(
		'pip-requirements',
		{
			async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.CompletionItem[]> {
				const linePrefix = document.lineAt(position).text.substring(0, position.character);
				const m = linePrefix.match(/^([0-9a-zA-Z-_]+)(?:==)/);
				if (m) {
					const name = m[1];
					const result = await fetchPackageData(name);
					if (!result) return [];
					const versions: { version: string, upload_time: string | null | undefined }[] = [];
					for (const [version, info] of Object.entries(result.releases)) {
						versions.push({
							version,
							upload_time: Array.isArray(info) ? info.find(e => e.upload_time)?.upload_time : null
						});
					}
					versions.sort((a, b) => {
						if (!a.upload_time || !b.upload_time)
							return a.version.split('.') > b.version.split('.') ? -1 : 1;
						return a.upload_time > b.upload_time ? -1 : 1;
					});
					return versions.map((e, i) => {
						const item = new vscode.CompletionItem(e.version);
						item.sortText = i.toString().padStart(8, '0');
						item.detail = e.upload_time || '';
						return item;
					})
				}
				return [];
			}
		},
		'='
	);

	const hoverProvider = vscode.languages.registerHoverProvider('pip-requirements', {
		async provideHover(document: vscode.TextDocument, position: vscode.Position) {
			console.log(position, document);
			const line = document.lineAt(position).text;
			console.log(line);
			const m = line.match(/^([0-9a-zA-Z-_]+)/);
			if (m) {
				const result = await fetchPackageData(m[1]);
				if (!result) return { contents: [] };
				return {
					contents: [
						result.info.description
					]
				};
			}
			return {
				contents: []
			};
		}
	});

	context.subscriptions.push(completionProvider);
	context.subscriptions.push(hoverProvider);
}

// this method is called when your extension is deactivated
export function deactivate() { }
