/* Configure an HTTPS endpoint that accepts FormData and returns a successful
   HTTP response only after accepting the message. No API secret belongs here.
   With no endpoint, the form prepares an email draft and never claims to send. */
window.FIJLY_CONFIG = {
  contactEndpoint: '',
  contactEmail: 'hello@fijly.com'
};
