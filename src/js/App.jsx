import React, { Component } from 'react';
import * as $ from 'axios';

const stateKey = 'spotify_auth_state';

export default class App extends Component {

	constructor(props) {
		super(props);
		this.state = {
			user: null,
			playlists: null,
			access_token: null,
			multiFileExport: false
		}
		this.spotifyAuth = this.spotifyAuth.bind(this);
		this.exportSelectedPlaylists = this.exportSelectedPlaylists.bind(this);
		this.toggleSelectedPlaylists = this.toggleSelectedPlaylists.bind(this);
		this.toggleMultiFileExportMode = this.toggleMultiFileExportMode.bind(this);
	}

	componentDidMount() {

		var params = this.getHashParams();

		var state = params.state,
			storedState = localStorage.getItem(stateKey);

		if('access_token' in params) {
			this.setState({access_token: params.access_token}, () => {
				if (this.state.access_token && (state == null || state !== storedState)) {
					console.warn('There was an error during the authentication');
				}
				else {
					localStorage.removeItem(stateKey);
					if (this.state.access_token) {
						$.get('https://api.spotify.com/v1/me', {
							headers: {
							'Authorization': 'Bearer ' + this.state.access_token
							}
						})
						.then((response) => {
							this.setState({user: response.data, playlists: []});
							$.get('https://api.spotify.com/v1/me/playlists?limit=50', {
								headers: {
								'Authorization': 'Bearer ' + this.state.access_token
								}
							})
							.then((response) => {
								let playlists = response.data;
								for(let playlist of playlists.items) {
									playlist.byebyespotify_should_export = true;
								}
								this.setState({playlists: playlists});
							})
						})
					}
				}
			});
		}


	}

	componentWillUnmount() {

	}

	makeTrackCSVFromPlaylist(trackList, playlistName) {
		//console.log('we got a tracklist here bobo');
		let csv = '';
		if(trackList.items.length) {
			trackList.items.forEach( (item, index) => {
				csv += this.sanitizeFieldForCSV(item.track.name)  + ',' + this.sanitizeFieldForCSV(item.track.artists[0].name) + ',' + this.sanitizeFieldForCSV(item.track.album.name);
				if(!this.state.multiFileExport) {
					csv += ',' + this.sanitizeFieldForCSV(playlistName);
				}
				if(index < trackList.items.length) {
					csv += '\r\n';
				}
			});
		}
		return csv;
	}

	// Takes a string and returns a string suitable for use in the CSV file,
	// adding quotes if the string contains a comma and escaping quotes if quotes were added.
	// See: http://stackoverflow.com/questions/769621/dealing-with-commas-in-a-csv-file
	sanitizeFieldForCSV(string) {
		if(string.includes(',')) {
			if(!string.includes('"')) {
				return '"' + string + '"';
			}
			return '"' + string.replace(/"/g, '\"') + '"';
		}
		return string;
	}

	// Spotify's API limits the number of songs returned by most calls to 100
	// For playlists of greater than 100 songs, this function is recursive (
	// it calls itself) until every song in the playlist is known
	getPlaylistDetails(playlist) {

		return $.get(playlist.href, {
			headers: {
			'Authorization': 'Bearer ' + this.state.access_token
			}
		})
		.then((response) => {

			let nextURL = null;
			if('data' in response) {
				if('items' in response.data) {
					// this data structure means we're in a recursive page response
					playlist.trackList.items = [].concat(playlist.trackList.items, response.data.items);

					if(response.data.next) {
						nextURL = response.data.next;
					}
				}
				else if('tracks' in response.data) {
					// this data structure means we're in the first page response
					playlist.trackList = response.data.tracks;

					if(response.data.tracks.next) {
						nextURL = response.data.tracks.next;
					}
				}
				if(nextURL) {
					playlist.href = nextURL;
					return this.getPlaylistDetails(playlist); // have another go if there are more tracks we haven't added yet
				}
			}
		})
	}

	spotifyAuth() {
		let client_id = '0e5aaf3062d24668b96cbe8c6309aa36';
		let redirect_uri = 'http://localhost:8888/';

		let state = this.generateRandomString(16);

		localStorage.setItem(stateKey, state);
		let scope = 'user-read-private user-read-email playlist-read-collaborative';

		let url = 'https://accounts.spotify.com/authorize';
		url += '?response_type=token';
		url += '&client_id=' + encodeURIComponent(client_id);
		url += '&scope=' + encodeURIComponent(scope);
		url += '&redirect_uri=' + encodeURIComponent(redirect_uri);
		url += '&state=' + encodeURIComponent(state);

		window.location = url;
	}

	/**
	* Generates a random string containing numbers and letters
	* @param  {number} length The length of the string
	* @return {string} The generated string
	*/
	generateRandomString(length) {
		var text = '';
		var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

		for (var i = 0; i < length; i++) {
			text += possible.charAt(Math.floor(Math.random() * possible.length));
		}

		return text;
	}

	/**
	* Obtains parameters from the hash of the URL
	* @return Object
	*/
	getHashParams() {
		var hashParams = {};
		var e, r = /([^&;=]+)=?([^&;]*)/g,
		  q = window.location.hash.substring(1);
		while ( e = r.exec(q)) {
			hashParams[e[1]] = decodeURIComponent(e[2]);
		}

		return hashParams;
	}

	renderUserProfile() {
		if(this.state.user) {
			//console.log('sherpin a derp', this.state);
			let { user } = this.state;
			return (
				<div>
					<h1>Hey, <img width="50" className="profile-picture" src={user.images[0].url} /> {user.display_name}</h1>
				</div>
			);
		}
	}

	downloadPlaylists(playlists) {
		console.log('gonna downloadPlaylists', playlists);
		if(Array.isArray(playlists) && playlists.length) {
			const promiseArray = Array.from(playlists, (playlist) => {
				return this.getPlaylistDetails(playlist);
			});

			Promise.all(promiseArray)
			.then(() => {
				console.log('got the tracks for all selected playlists, time to assemble CSVs');

				if(this.state.multiFileExport) {
					playlists.forEach((playlist) => {
						let csvFile = 'data:text/csv;charset=utf-8,' + 'title,artist,album\r\n' + this.makeTrackCSVFromPlaylist(playlist.trackList, playlist.name);
						console.log('csv contents', csvFile);
						this.triggerPlaylistDownload(playlist.name, csvFile);
					});
				}
				else {
					const formattedDate = new Date().toLocaleString(false,{ year: 'numeric', month: 'long', day: 'numeric' }).replace(',', '').replace(/ /g, '-');
					let csvFile = 'data:text/csv;charset=utf-8,' + 'title,artist,album,playlist\r\n';
					playlists.forEach((playlist) => {
						csvFile += this.makeTrackCSVFromPlaylist(playlist.trackList, playlist.name);
					});
					this.triggerPlaylistDownload(this.state.user.uri + '_playlists_exported_' + formattedDate, csvFile);
				}
			});
		}
	}

	triggerPlaylistDownload(fileName, csvFile) {
		let encodedFile = encodeURI(csvFile);
		let link = document.createElement('a');
		link.setAttribute('href', encodedFile);
		link.setAttribute('download', fileName + '.csv');
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	exportSelectedPlaylists() {
		console.log('beginning playlist export, multi-file mode is', this.state.multiFileExport);
		let playlistsToExport = this.getCurrentSelectedPlaylists();
		this.downloadPlaylists(playlistsToExport);
	}

	toggleSelectedPlaylists(on) {
		let playlists = {
			...this.state.playlists
		};
		playlists.items.forEach((item) => {
			item.byebyespotify_should_export = on;
		});
		this.setState({playlists: playlists});
	}

	renderUserPlaylists() {
		if(this.state.user && this.state.playlists) {
			if('items' in this.state.playlists) {
				return (
					<div>
						<h4>Your playlists:</h4>
						<button className="btn btn-default" onClick={() => this.toggleSelectedPlaylists(true)}>Select All</button>
						<button className="btn btn-default" onClick={() => this.toggleSelectedPlaylists(false)}>Select None</button>
						{
							this.state.playlists.items.map( (playlist, index) => {
								return (
									this.renderIndividualPlaylist(playlist, index)
								)
							})
						}
					</div>
				)
			}
			return (
				<div>
					<h3>loading playlists...</h3>
				</div>
			)
		}
	}

	togglePlaylistExport(event, index) {

		let newPlaylists = {
			...this.state.playlists
		}
		newPlaylists.items[index].byebyespotify_should_export = event.target.checked;
		this.setState({
			...this.state,
			playlists: newPlaylists
		})
	}

	toggleMultiFileExportMode(event) {
		this.setState({multiFileExport: !this.state.multiFileExport});
	}

	getCurrentSelectedPlaylists() {
		if(this.state.playlists && 'items' in this.state.playlists) {
			return this.state.playlists.items.filter( (playlist) => {
				return playlist.byebyespotify_should_export;
			})
		}
		return [];
	}

	renderIndividualPlaylist(playlist, index) {
		return(
			<div key={playlist.id} className="playlist">
				<h5>
					<input type="checkbox" checked={playlist.byebyespotify_should_export} onChange={ (event) => { this.togglePlaylistExport(event, index) } } />
					{playlist.name}
					{
						playlist.collaborative && <abbr title="Collaborative" className="playlist-modifier label label-info">C</abbr>
					}
					{
						playlist.owner.id !== this.state.user.id && <abbr title="Not owned by you!" className="playlist-modifier label label-info">N</abbr>
					}
				</h5>
			</div>
		);
	}

	renderMeatAndPotatoes() {

		let playlistsToExport = this.getCurrentSelectedPlaylists();
		let totalPlaylists = this.state.playlists && 'items' in this.state.playlists ? this.state.playlists.items.length : 0;

		if(this.state.user) {
			return (
				<div className="row meat-and-potatoes">
					<div className="col-xs-12 col-md-4 col-md-offset-2 playlists">
						{ this.renderUserPlaylists() }
					</div>
					<div className="col-xs-12 col-md-4 controls">
						<h3>{ playlistsToExport.length } / { totalPlaylists } playlists selected for export</h3>
						<h4>Export mode</h4>
						<label>
							<input type="radio" name="export-mode" value="0" checked={(!this.state.multiFileExport)} onChange={this.toggleMultiFileExportMode} />
							Single file containing all playlists (for export to Google Play Music)
						</label>
						<label>
							<input type="radio" name="export-mode" value="1" checked={(this.state.multiFileExport)} onChange={this.toggleMultiFileExportMode} />
							One file per playlist
						</label>
						<button onClick={this.exportSelectedPlaylists} className="btn btn-block btn-primary">Export to CSV</button>
					</div>
				</div>
			);
		}
	}

	render() {

		return (
			<div className="container-fluid">
				<div className="row header">
					<div className="col-xs-12 col-md-8 col-md-offset-2">
						<div className="text-center">
							<h1>Bye Bye, Spotify</h1>
							<h2>Saying goodbye to Spotify? Take your playlists with you!</h2>
							{
								!this.state.user && <button onClick={this.spotifyAuth} className="btn btn-primary spotify-button">Log in with Spotify</button>
							}
							{
								this.state.user && this.renderUserProfile()
							}
						</div>
					</div>
				</div>
				{ this.renderMeatAndPotatoes() }
			</div>
		);

	}
}
