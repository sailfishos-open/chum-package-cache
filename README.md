# chum-package-cache
A server application which generates a JSON cache of the data in the SailfishOS:Chum OBS repository

The server has 2 modes of operation:
1. A GET call will return the cache
2. A POST call will re-generate the cache

Note the following:
 * Creating the cache requires OBS credentials
 * Creating the cache takes a long time
 * I have not attempted to run any parts asynchronously so that there is less change of overloading the OBS server

