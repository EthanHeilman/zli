#!/bin/bash
# This script installs BastionZero's ZLI on MacOS and Linux using brew, apt, or yum.
#
# For more information about the ZLI, please see https://docs.bastionzero.com/docs/zli-reference-manual.

function main () {
	detect_package_manager
	install_zli
	check_zli
}

function detect_package_manager () {
	if [ ! -z $(command -v brew) ] ; then
		PACKAGE_MANAGER=Brew
	elif [ ! -z $(command -v apt) ]; then
		PACKAGE_MANAGER=Apt
	elif [ ! -z $(command -v yum) ]; then
		PACKAGE_MANAGER=Yum
	else
		PACKAGE_MANAGER=Unknown
	fi
}

function install_zli_brew {
	echo "Installing ZLI using brew."
	brew install bastionzero/tap/zli
}

function install_zli_apt {
	echo "Installing ZLI using apt."
	# software-properties-common is required for add-apt-repository
	sudo apt install -y software-properties-common
	sudo apt-key adv --keyserver keyserver.ubuntu.com --recv-keys E5C358E613982017
	sudo add-apt-repository 'deb https://download-apt.bastionzero.com/production/apt-repo stable main'
	sudo apt update -y
	sudo apt install zli -y
}

function install_zli_yum {
	echo "Installing ZLI using yum."
	sudo yum-config-manager --add-repo https://download-yum.bastionzero.com/bastionzero.repo
	sudo yum update zli -y
	sudo yum install zli -y
	sudo yum update zli -y
}

function install_zli () {
	ZLI_OLD_VERSION=$(zli --version 2> /dev/null)

	case $PACKAGE_MANAGER in
		Brew)
			install_zli_brew
			;;
		Yum)
			install_zli_yum
			;;
		Apt)
			install_zli_apt
			;;
		Unknown)
			echo "This script cannot install the ZLI because no supported package manager was found."
			;;
	esac
}

function check_zli () {
	if [ ! -z $(command -v zli) ]; then
		ZLI_CURRENT_VERSION=$(zli --version 2> /dev/null)

		if [ -z "$ZLI_OLD_VERSION" ] && [ ! -z "$ZLI_CURRENT_VERSION" ]; then
			# ZLI_OLD_VERSION is empty so ZLI was not previously installed.
			echo "ZLI installed"
		elif [ ! -z "$ZLI_OLD_VERSION" ] && [ ! -z "$ZLI_CURRENT_VERSION" ] && [ "$ZLI_OLD_VERSION" != "$ZLI_CURRENT_VERSION" ]; then
			# Both ZLI_OLD_VERSION and ZLI_CURRENT_VERSION are not empty and not equal so assuming this was an upgrade.
			echo "ZLI upgraded"
		fi
	else
		echo "ZLI installation failed. You can find more information about ZLI installation here: https://docs.bastionzero.com/docs/deployment/installing-the-zli."
	fi
}

main "$@";
