// JS
import React from "react";
import Uploader from "../components/uploader";
import FileData from "../components/filedata";
import Form from 'react-bootstrap/Form';
import Button from 'react-bootstrap/Button';
import {Link, Trans, useTranslation} from 'gatsby-plugin-react-i18next';
// IMG
import LoadGif from '../images/hourglass.gif';


class UploadUi extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            text: 'Copier-coller / Copy-Paste',
            uploaded :  'Copier-coller / Copy-Paste',
            upload_ref: false,
            res_text: {__html: '(Zone résultat)' },
            log_text: {__html: '' },
            file_meta: false,
            isDegraded: false,
            parse_waiting: false,
            parse_state: [],
            pages_buffer: [],
            pages_total: 0,
            page_current: 0,
            ocr_streaming: true,
            waiting: false,
            anon_visible: false,
            error: false
        };
        this.handleSubmit = this.handleSubmit.bind(this);
        this.handleTransfer = this.handleTransfer.bind(this);
        this.handleTextChange = this.handleTextChange.bind(this);
        this.handleTextExtract = this.handleTextExtract.bind(this);
        this.handleTextPage = this.handleTextPage.bind(this);
        this.handleReference = this.handleReference.bind(this);
        this.toggleAnonLog = this.toggleAnonLog.bind(this);
        // this.handleTextMeta = this.handleTextMeta.bind(this);
        this.handleCallback = props.TextHandler;
    }

    logDisplay(loglines) {
        return loglines.join("\n<br />");
    }

    // 1. Get reference
    // 2. Wait for meta
    // 3. Wait for text results
    
    toggleAnonLog() {
        this.setState({
            anon_visible: !this.state.anon_visible
        });
    }

    handleReference(ref) {
        this.setState({
            upload_ref: ref,
            parse_waiting: true,
            parse_state:['Chargé / Opgeladen'],
            res_text: {__html: '(Zone résultat)' },
            text: '',
            pages_buffer: [],
            pages_total: 0,
            page_current: 0,
            file_meta: false,
            error:false,
        })

        const obj = this;
        const fun = (F, I) => {
            if (I <= 0) {
                obj.handleTextExtract(false, 'No server response')
                obj.setState({
                    parse_waiting: false,
                });
                return
            }
            I = I - 1;
                
            const url = `${process.env.GATSBY_UPLOAD_API}/extract/status?ref=${ref}`;
            fetch(url)
                .then( response => response.json() )
                .then( data => {
                    if (data['status'] === 'empty') {
                        if (obj.state.page_current === obj.state.pages_total) {
                            obj.setState({ parse_waiting: false });
                            // No more pages expected, just quit !
                            return;
                        }
                        setTimeout(() => F(F,I), 2000);
                    }
                    else if (data['status'] === 'error') {
                        obj.handleTextExtract(false, data['value'])
                        const pstate = [...obj.state.parse_state, 'Error :('];
                        obj.setState({
                            parse_waiting: false,
                            parse_state: pstate,
                        });
                    }
                    else if (data['status'] === 'meta') {
                        obj.handleTextMeta(data['value'], data['value']['doOcr'])
                        setTimeout(() => F(F, I), 1000);
                    }
                    // Receive the text in full
                    else if (data['status'] === 'text') {
                        obj.handleTextExtract(true, data['value'])
                        obj.setState({ parse_waiting: false });
                    }
                    // Receive the text page by page
                    else if (data['status'] === 'page') {
                        obj.handleTextPage(data['value']['page'], data['value']['text'])
                        setTimeout(() => F(F, I), 1000);
                    }
                    return
                })
            }
        setTimeout(() => fun(fun, 1000), 1000);
    }

    handleTextMeta(meta, degraded=false) {
        const pstate = [ ...this.state.parse_state, 'Meta données reçues / Metadata ontvangen']
        this.setState({
            file_meta: meta,
            isDegraded: degraded,
            parse_state: pstate,
            pages_total: meta['pages'],
        });
    }

    handleTextExtract(success, text) {
        if (success) {
            const pstate = [...this.state.parse_state, 'Texte reçu / Tekst ontvangen']
            this.setState({
                text: text,
                page_current: this.state.pages_total,
                parse_state: pstate,
                //uploaded: text
            });
        } else {
            this.setState({
                error: `Erreur d'extraction, Extractiefout: ${text}`
            });
        }
    }

    handleTextPage(page, content) {
        const curPage = this.state.page_current;
        const pstate = [...this.state.parse_state, `Page ${page} reçue / Pagina ${page} ontvangen`]
        if (page === curPage + 1) {
            // All good, this is the next page
            let newTextArray = [this.state.text, content];
            let newPage = page;
            const buffer = [...this.state.pages_buffer];
            let newBuffer = [];

            if (buffer.length > 0) {
                buffer.sort((a, b) => a.p - b.p);
                buffer.forEach(el => {
                    if (el.p === newPage + 1) {
                        newTextArray.push(el.t);
                        newPage = el.p;
                    } else {
                        newBuffer.push(el);
                    }
                });
            }

            this.setState({
                page_current: newPage,
                text: newTextArray.join(''),
                parse_state: pstate,
                pages_buffer: newBuffer,
            });

        } else {
            // Ok, not the page we expected, but let's keep it anyway
            const newBuffer = [...this.state.pages_buffer, {'p': page, 't': content}];
            this.setState({
                pages_buffer: newBuffer,
                parse_state: pstate,
            });
        }
        // TODO: check buffer for other pages to join to text
    }

    handleTextChange(event) {
        this.setState({
            text: event.target.value
        });
    }

    handleTransfer(event) {
        event.preventDefault();
        this.handleCallback(this.state.text, [],  {log_text: "Contenu sans anonymisation / Inhoud zonder anonymisatie"});
    }

    handleSubmit(event) {
        this.setState({waiting: true, error: false})
        event.preventDefault();

        const query = {
            '_v' : 1,
            '_timestamp': Math.floor(Date.now() / 1000),
            'algo_list' : [{'id':'anon_trazor', 'params':"{}"}, {'id': 'anon_mask', 'params': "{}"}],
            'format': 'text',
            'encoding': 'utf8',
            'text': this.state.text,
            'error': false,
            'anon_log': false,
        }

        // Get api response
        // fetch(`https://anon-api.openjustice.be/run`, {
        fetch(`${process.env.GATSBY_UPLOAD_API}/parse`, {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(query),
        }).then(response => response.json()
        ).then(resultData => {
                if ('error' in resultData.log)
                    {
                    const msg = `Erreur de traitement, Verwerkingsfout: ${resultData.log.error}`;
                    this.setState({'anon_log' : {__html: msg}});
                    this.handleCallback(false, '', {log_text: msg});
                    }
                else
                    {
                    this.handleCallback(this.state.text, resultData.entities,  {log_text: this.logDisplay(resultData.log.lines)});
                    this.setState({'anon_log' : {__html: this.logDisplay(resultData.log.lines)}});
                    }
                this.setState({waiting: false})
        }).catch(error => {
            const msg = `Erreur de serveur, Server fout: ${error.toString()}`;
            this.setState({'anon_log' : {__html: msg}});
            this.handleCallback(false, '', {log_text: msg});
            this.setState({waiting: false});
        });
    }


    render() {
        return (
            <div className="col-12 my-5 private">
                <div className="part-heading row">
                    <div className="mr-4">
                        <span className="page-current">1</span>
                        <span className="page-total">/3</span>
                    </div>
                    <div>
                        <h2><Trans>Préparer le contenu</Trans></h2>
                        <p><Trans>Le contenu dans se cadre ne sera pas enregistré</Trans></p>
                    </div>
                </div>
                <div className="row justify-content-center">
                    <Uploader
                        parentCallback={ this.handleReference }
                        waiting={ this.state.parse_waiting }
                        state={ this.state.parse_state }
                    />
                </div>
                <div className="row justify-content-center mt-3">
                    <div className="col-12 col-lg-3 order-first order-lg-last mb-3">
                        <div className="stream_info col-12 bg-secondary text-white">
                            <Trans>Détails</Trans>
                        </div>
                        <FileData
                            state={ this.state.parse_state }
                            degraded={ this.state.isDegraded }
                            meta={ this.state.file_meta }
                        />
                        <div className="row justify-content-center">
                            { this.state.error &&
                                <div className="log col-10 oj-error my-3">
                                    { this.state.error }
                                </div>
                            }
                        </div>
                    </div>
                    <div className="col-12 col-lg-9 order-last order-lg-first">
                        { this.state.ocr_streaming &&
                            <div className="stream_info col-12 bg-secondary text-white">
                                <i className="icon-wallet" />
                                <Trans>Pages</Trans> : { this.state.page_current } / { this.state.pages_total }
                            </div>
                        }
                        <textarea
                            id="content_raw"
                            update={ this.state.uploaded }
                            onChange={ this.handleTextChange }
                            value ={ this.state.text }
                            className="col-12 bigtext"
                            />
                    </div>
                </div>
                <div className="row justify-content-center mt-3">
                    <Form onSubmit={ this.handleSubmit } className="pl-3">
                      <Button variant="" type="submit" className="btn-ojact">
                      { this.state.waiting && <img className="loadgif" src={LoadGif} alt="loading" /> }
                      <Trans>Anonymiser</Trans>
                      </Button>
                    </Form>
                    <Form onSubmit={ this.handleTransfer}>
                      <Button variant="" type="submit" className="ml-3 btn-outline-ojact">
                      <Trans>Déjà anonymisé</Trans>
                      </Button>
                      <Button variant="" type="submit" className="ml-3 btn-outline-ojact">
                      <Trans>Mettre à jour le texte</Trans>
                      </Button>
                    </Form>
                </div>
                { this.state.anon_log &&
                <div className="row justify-content-center mx-3">
                    <div className="col-10">
                        <button className="btn btn-ojsimple" onClick={ this.toggleAnonLog }>
                            <Trans>Afficher le journal</Trans>
                        </button>
                    </div>
                    { this.state.anon_visible &&
                        <div id="anon_log" className="log col-10" dangerouslySetInnerHTML={ this.state.anon_log } />
                    }
                </div>
                }
            </div>
        );
    }
}

export default UploadUi
