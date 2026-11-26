package pk.edu.nust.aeris;

import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import java.time.Duration;
import java.time.Instant;
import java.util.*;

@Service
public class LocationDiscoveryService {
    public record Place(long id,String name,String region,String country,double latitude,double longitude) {}
    public record Preview(Double aqi,Double pm25,Double pm10,String source,Instant timestamp,boolean stale) {}
    private final AreaRepository areas;
    private final MonitoringService monitoring;
    private final RestClient geocoding;
    public LocationDiscoveryService(AreaRepository a,MonitoringService m){
        areas=a;monitoring=m;
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(8));
        geocoding = RestClient.builder().baseUrl("https://geocoding-api.open-meteo.com").requestFactory(factory).build();
    }
    public List<Place> discover(String query, String country) {
        var payload = geocoding.get().uri(uri -> {
            uri.path("/v1/search").queryParam("name", "{query}").queryParam("count", 10).queryParam("language", "en");
            if (!country.isEmpty()) uri.queryParam("countryCode", country.toUpperCase(Locale.ROOT));
            return uri.build(query);
        }).retrieve().body(JsonNode.class);
        if (payload == null || payload.path("error").asBoolean()) {
            throw new IllegalStateException("Location search is unavailable.");
        }
        var places = new ArrayList<Place>();
        for (var result : payload.path("results")) {
            if (!result.path("id").isIntegralNumber() || result.path("name").asText().isBlank()
                || !result.path("latitude").isNumber() || !result.path("longitude").isNumber()) continue;
            places.add(new Place(result.path("id").asLong(), result.path("name").asText(),
                result.path("admin1").asText(), result.path("country").asText(),
                result.path("latitude").asDouble(), result.path("longitude").asDouble()));
        }
        return places;
    }
    public List<Place> search(String query,String country) {
        if(!country.isBlank()&&!country.equalsIgnoreCase("PK"))return List.of();
        var result=new ArrayList<Place>();
        for(var area:areas.findByArchivedFalseOrderByIdAsc()) {
            var c=PakistanCities.find(area.name);
            if(c!=null && area.name.toLowerCase(Locale.ROOT).contains(query.toLowerCase(Locale.ROOT)))
                result.add(new Place(area.id,c.name(),c.region(),"Pakistan",area.latitude,area.longitude));
        }
        return result;
    }
    public Preview preview(double latitude,double longitude) {
        var area=areas.findByArchivedFalseOrderByIdAsc().stream().filter(a -> a.latitude==latitude && a.longitude==longitude).findFirst();
        var r=area.flatMap(a -> monitoring.latest(a.id)).orElse(null);
        return r==null?new Preview(null,null,null,monitoring.source(),null,true):new Preview(r.aqi,r.pm25,r.pm10,r.source,r.timestamp,!monitoring.fresh(r));
    }
}
