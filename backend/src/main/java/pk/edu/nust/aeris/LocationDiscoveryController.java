package pk.edu.nust.aeris;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;

@RestController
@RequestMapping("/api/locations")
public class LocationDiscoveryController {
    private final LocationDiscoveryService discovery;
    public LocationDiscoveryController(LocationDiscoveryService discovery) {this.discovery=discovery;}
    @GetMapping("/search")
    public List<LocationDiscoveryService.Place> search(@RequestParam String q,@RequestParam(defaultValue="") String country,
                                                       @RequestParam(defaultValue="false") boolean discover) {
        q=q.trim();country=country.trim();
        if(q.length()<2 || q.length()>100 || (!country.isEmpty() && !country.matches("[a-zA-Z]{2}")))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Enter a location name of 2–100 characters and, optionally, a two-letter country code.");
        try {return discover ? discovery.discover(q,country) : discovery.search(q,country);}
        catch(Exception e) {throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Location search provider unavailable. Retry or use exact coordinates.");}
    }
    @GetMapping("/preview")
    public LocationDiscoveryService.Preview preview(@RequestParam double latitude,@RequestParam double longitude) {
        if(!Double.isFinite(latitude) || !Double.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Latitude must be −90 to 90 and longitude −180 to 180.");
        try {return discovery.preview(latitude,longitude);}
        catch(Exception e) {throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Air-quality provider unavailable for this request. Please retry; no sample data has been substituted.");}
    }
}
