# zli

## Bastionzero

Bastionzero is a simple to use zero trust access SaaS for dynamic cloud environments. Bastionzero is the most secure way to lock down remote access to servers, containers, clusters, and VM’s in any cloud, public or private. For more information go to [Bastionzero](https://www.bastionzero.com).

The zli is a cli client for interacting with the Bastionzero SaaS

## Install

BastionZero's command-line interface, the `zli`, is available through package managers (`brew`, `yum`, and `apt`).

The `zli` is compatible with both `x86` and `amd64` platforms.
### Brew
```
brew install bastionzero/tap/zli
```

### Yum

*   Use the `yum-config-manager` to add the BastionZero repo.
    ```
    sudo yum-config-manager --add-repo \
    https://download-yum.bastionzero.com/bastionzero.repo
    ```
    
*   Install the `zli`.
    ```
    sudo yum install -y zli
    ```

### Apt
*   Install the BastionZero public key from the Ubuntu key-server.
    ```
    sudo apt-key adv --keyserver keyserver.ubuntu.com\
     --recv-keys E5C358E613982017
    ```

*   For `http` (i.e., on an Ubuntu 14.x machine), add the BastionZero repo with:
    ```
    sudo add-apt-repository \
    'deb http://download-apt.bastionzero.com/production/apt-repo stable main'
    ```

*   For `https`, add the BastionZero repo with:
    ```
    sudo add-apt-repository \
    'deb https://download-apt.bastionzero.com/production/apt-repo stable main'
    ```

*   Update the `apt` cache.
    ```
    sudo apt update
    ```

*   Install the `zli`.
    ```
    sudo apt install -y zli
    ```

## Developer processes

### Clone and setup

It goes without saying, but the first step is to clone the repository
```
git clone https://github.com/bastionzero/zli.git
```

The `zli` uses git submodules, thus you will need to clone these as well
```
git submodule update --init --recursive
```

Finally, you will need to install the required packages
```
npm install
```

### Build and Run

Now that everything is ready you can execute any `zli` command you wish by building and running at the same time
```
npm run start -- <cmd> [args] --flag flagArg
```

We would suggest
```
npm run start -- help
```
Or
```
npm run start -- login
```

To see further building options feel to explore the `package.json` file

### Testing

To run unit tests you can use the following command
```
npm run test
```

System tests can also be run using the following command: 
```
npm run system-test
```

Note the following environment variables will need to be set: 
* `DO_API_KEY`: This is the digital ocean API key that is used to spin up droplets (i.e. targets) that is needed in order to run our tests
* The following vars can be used to run different suites. Setting them to "true" will run the suites: 
    * `API_ENABLED`: Run the API test suite
    * `KUBE_ENABLED`: Run the Kubernetes test suite
    * `SSM_ENABLED`: Run the bzero-ssm-agent test suite
    * `VT_ENABLED`: Runs our virtual target test suite (i.e. bzero agent)

There are also some optional parameters that can be used: 
* `SYSTEM_TEST_TAGS`: Comma separated list of optional tags to tag the digital ocean droplet
* `BZERO_AGENT_BRANCH`: In order to build and bzero agent (VT targets, kube, etc) from source, you will need to specify the bzero agent branch. The bzero repo can be found [here](https://github.com/bastionzero/bzero)
* `BCTL_QUICKSTART_VERSION`: This variable can be used to specify which version of the bctl quickstart helm chart to use

### Run against stage or dev

The following command is hidden from the help menu:

```
npm run start -- <cmd> [args] --configName <prod | stage | dev>
zli --configName <prod | stage | dev>
```

## Release Process

We use [pkg](https://github.com/vercel/pkg) to package the node.js application into a single executable that can be run even without node or any npm dependencies are installed. The target executables can be configured in the `package.json` file for different OSs as documented [here](https://github.com/vercel/pkg#targets) but the default is to build mac, and linux executable for the current node.js version and arch. Use `npm run release` to package the app and output executables to a `bin` directory.

### Release Versioning

The executables will be published to the s3 bucket with 2 different path prefixes each time the codebuild job is run:

1. `webshell-cli-release/release/latest/`

2. `webshell-cli-release/release/{version}`

Where {version} is the version that is defined in the `package.json` file. This means older versions are still accessible but the `latest` folder will always overwritten by the codebuild job.

## Installing a release

The latest releases can be found here:

```
Mac:        download-zli.bastionzero.com/release/latest/bin/zli-macos
Linux:      download-zli.bastionzero.com/release/latest/bin/zli-linux
```

### Mac users:

- download the executable
- `chmod +x` the executable
- Run the program once and see a warning from Apple
- Go to `System Preferences > Security & Privacy > General > Allow zli`
- Run the executable again and confirm for Apple

Minor releases generating warnings for users to update their zli. Major releases
will cause all lower major versions to error.

### Linux users:

- download the executable
- `chmod +x` the executable

## Running zli

```
zli help  # auto-gen help menu
```
