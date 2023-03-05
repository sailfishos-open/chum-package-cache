const http = require("http");
const fs = require('fs');
const { XMLParser, XMLBuilder, XMLValidator} = require("fast-xml-parser");

let username = "";
let password = "";
let obsurl = "https://api.sailfishos.org/";
let headers = new Headers;
headers.set('Authorization', 'Basic ' + Buffer.from(username + ":" + password).toString('base64'));

let buildingCache = false;

const options = {
ignoreAttributes : false
};
const parser = new XMLParser(options);

async function getPackages(project)
{
	console.log("Getting package list");
	let packages = [];

	await fetch(obsurl + "/source/" + project, {method: "GET", headers: headers})
	.then((response) => response.text())
	.then((str) => {
		//console.log(str);
		const json = parser.parse(str);
		//console.log(JSON.stringify(json));

		for (entry of json.directory.entry) {
			let pkg = {};
			pkg.name = entry["@_name"];
			packages.push(pkg);
		}
	});

	for (p of packages) {
		p.mtime = await getPackageMTime(project, p.name);
	}
	return packages;
}

async function getPackageMTime(project, p)
{
	console.log("Getting package mtime, ", project, p);
	return fetch(obsurl + "/source/" + project + "/" + p, {method: "GET", headers: headers})
		.then((response) => response.text())
		.then((str) => {
			try {
				const pkg = parser.parse(str);
				//console.log(JSON.stringify(pkg));

				if (Array.isArray(pkg.directory.entry)) {
					var mod = 0;
					for (entry of pkg.directory.entry) {
						//console.log(entry);
						if (entry["@_mtime"] > mod) {
							mod = entry["@_mtime"];
						}
					}
					return mod;
				} else {
					return pkg.directory.entry["@_mtime"];
				}
			} catch(e) {
				return 0;
			}

		});
}

async function getPackageBinaries(project, repo, arch, name)
{
		console.log("Getting package binaries, ", project, repo, arch, name);

		return fetch(obsurl + "/build/" + project + "/" + repo + "/" + arch + "/" + name, {method: "GET", headers: headers})
		.then((response) => response.text())
		.then((str) => {
			//console.log(str);

			try {
				var rpms = [];
				const pkg = parser.parse(str);
				//console.log(JSON.stringify(pkg));

				for (f of pkg.binarylist.binary) {
					if (f["@_filename"].endsWith("rpm")) {
						rpms.push(f["@_filename"]);
					}
				}
				return rpms;
			} catch(e) {
				return [];
			}

		});
}

async function getCachedResult(req, res)
{
	fs.readFile('cache.json', 'utf8', (err, data) => {
		if (err) {
			res.end(JSON.stringify({"error":"unable to read file"}));
			return;
		}
		res.end(data);
	});
}

async function buildCache()
{
	buildingCache = true;

	var data = {
		projects: []
	}

	data.projects.push(await buildProjectCache("sailfishos:chum"));
	data.projects.push(await buildProjectCache("sailfishos:chum:testing"));


	//console.log(JSON.stringify(data, null, 2));
	fs.writeFile('cache.json', JSON.stringify(data), 'utf8', (err) => {
		if (err) {
			console.error(err);
			return;
		};
		console.log("File has been created");
	});
	buildingCache = false;
}

async function getProjectRepositories(project, packages)
{
	console.log("Getting project repositories ", project);

	//Get all repositories
	var repositories = [];

	await fetch(obsurl + "/build/" + project, {method: "GET", headers: headers})
		.then((response) => response.text())
		.then((str) => {
			try {
				const pkg = parser.parse(str);
				//console.log(JSON.stringify(pkg));

				for (entry of pkg.directory.entry) {
					var repository = {};
					repository.name = entry["@_name"];
					repository.packages = [];
					repositories.push(repository);
				}
			} catch(e) {
				return [];
			}

		});

		for (repository of repositories) {
			repository.architecture = await getRepositoryArchitecture(project, repository.name);

			for (p of packages) {
					pkg = {};
					pkg.name = p.name;
					pkg.binaries = await getPackageBinaries(project, repository.name, repository.architecture, p.name);
					repository.packages.push(pkg);
			}
		}
		return repositories;
}

async function getRepositoryArchitecture(project, repository)
{
	console.log("Getting repostitory architecture ", project, repository);

	//Get all repositories
	return await fetch(obsurl + "/build/" + project + "/" + repository, {method: "GET", headers: headers})
		.then((response) => response.text())
		.then((str) => {
			try {
				const arch = parser.parse(str);
				//console.log(JSON.stringify(arch));
				return arch.directory.entry["@_name"];
			} catch(e) {
				return [];
			}

		});
}

async function buildProjectCache(project)
{
	var cache = {
		name: project,
		packages: [],
		repositories: []
	};
	cache.packages = await getPackages(project);
	cache.repositories = await getProjectRepositories(project, cache.packages);

	return cache;
}

http.createServer(function (req, res) {
	// Send the HTTP header
	// HTTP Status: 200 : OK
	// Content Type: text/plain

	try {
		if (req.method == "POST") {
			if (buildingCache) {
				res.end(JSON.stringify({"error":"busy building cache"}, null, 2));
			} else {
				buildCache();
				res.end(JSON.stringify({"status":"building cache"}, null, 2));
			}
		} else {
			getCachedResult(req, res);
		}

	} catch (e) {
		res.end(JSON.stringify({"error":"unknown error"}, null, 2));
	}

}).listen(8081);

// Console will print the message
console.log('Server running at http://127.0.0.1:8081/');
