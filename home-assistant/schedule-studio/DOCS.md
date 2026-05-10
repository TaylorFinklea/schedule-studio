# Schedule Studio Add-on Documentation

## Installation

1. Add this repository to the Home Assistant add-on store.
2. Install the **Schedule Studio** add-on.
3. Start the add-on.
4. Select **Open Web UI**.

## Persistence

Schedule data is stored at `/data/schedule-studio.sqlite` inside the add-on container. Home Assistant manages this directory as persistent add-on data, so it survives restarts and is included in Home Assistant backups.

## Network

The add-on uses Home Assistant Ingress. Port `3000` is not published to the host by default.

## Reset Data

To reset all schedule data, stop the add-on and delete the add-on data directory from a Home Assistant backup/restore workflow or from the host shell. The next start recreates the SQLite database with fictional seed data.

## Support

Project source and issues: https://github.com/TaylorFinklea/schedule-studio
